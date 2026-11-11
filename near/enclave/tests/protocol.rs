//! The enclave's protocol end to end, on this machine: secrets go in sealed,
//! each party's view comes out sealed, and the public reply shows neither.

mod common;

use common::*;
use pari_core::books::Books;
use pari_core::proofs;
use pari_core::protocol::{handle, Input, Stored};
use pari_core::seal::{self, SecretKey};
use serde_json::{json, Value};

/// A deal's two sides: what the enclave stores, and what the rules contract holds.
struct Enclave {
    key: SecretKey,
    stored: Stored,
    /// The contract's side: the fingerprint from the last answer it received,
    /// and how many requests it has made.
    root: Option<String>,
    turn: u64,
    /// Everything that has gone on the public chain: inputs and replies.
    public: String,
}

impl Enclave {
    fn new() -> Enclave {
        Enclave { key: SecretKey::from([7u8; 32]), stored: Stored::default(), root: None, turn: 0, public: String::new() }
    }

    /// What a caller seals to the enclave: a command's secret fields, and the
    /// deal, the caller and the command they are for.
    fn seal(&self, caller: &str, command: &Value, mut secret: Value) -> String {
        secret["deal"] = json!("test-deal");
        secret["caller"] = json!(caller);
        secret["cmd"] = command["cmd"].clone();
        let enclave_key = seal::public_key(&seal::public_b64(&self.key)).unwrap();
        seal::seal(&enclave_key, secret.to_string().as_bytes()).unwrap()
    }

    /// What the rules contract sends for a command. `secret` is sealed to the
    /// enclave before it leaves the caller.
    fn request(&mut self, caller: &str, command: Value, secret: Option<Value>) -> Value {
        let sealed = secret.map(|secret| self.seal(caller, &command, secret));
        self.request_with(caller, command, sealed)
    }

    /// The same, with a box that is already sealed.
    fn request_with(&mut self, caller: &str, command: Value, sealed: Option<String>) -> Value {
        self.turn += 1;
        json!({ "deal": "test-deal", "caller": caller, "prev_root": self.root, "turn": self.turn, "command": command, "sealed": sealed })
    }

    /// The enclave runs a request and stores what it changed.
    fn run(&mut self, input: Value) -> Value {
        self.public.push_str(&input.to_string());
        let reply = handle(&self.stored, serde_json::from_value::<Input>(input).unwrap(), &self.key);
        if let Some(next) = reply.save {
            self.stored = next;
        }
        self.public.push_str(&reply.output.to_string());
        reply.output
    }

    /// A command, and the contract receiving the enclave's answer to it.
    fn call(&mut self, caller: &str, command: Value, secret: Option<Value>) -> Value {
        let input = self.request(caller, command, secret);
        let reply = self.run(input);
        if reply["ok"] == true {
            self.root = reply["root"].as_str().map(String::from);
        }
        reply
    }

    /// A command the enclave answers after the contract has stopped waiting.
    fn call_too_late(&mut self, caller: &str, command: Value, secret: Option<Value>) -> Value {
        let input = self.request(caller, command, secret);
        self.run(input)
    }
}

fn view_key(seed: u8) -> SecretKey {
    SecretKey::from([seed; 32])
}

fn open(reply: &Value, party: &str, key: &SecretKey) -> Value {
    let sealed = reply["envelopes"][party].as_str().expect("an envelope for the party");
    serde_json::from_slice(&seal::open(key, sealed).unwrap()).unwrap()
}

/// The Northwind deal, opened through the protocol with sealed positions.
fn open_deal() -> (Enclave, SecretKey, SecretKey) {
    let mut enclave = Enclave::new();
    let init = json!({
        "cmd": "init_deal",
        "terms": {
            "facility_id": "NORTHWIND-TLB-2026",
            "name": "Northwind Logistics Term Loan B",
            "margin_bps": 350,
            "closing": "2026-09-15",
            "maturity": "2031-09-15",
        },
        "agent": AGENT,
        "borrower": BORROWER,
        "auditor": AUDITOR,
    });
    let positions = json!({ "positions": { ALDER: "5000000000", BIRCH: "3000000000", CEDAR: "2000000000" } });
    assert_eq!(enclave.call(LEDGER, init, Some(positions))["ok"], true);

    let (alder, birch) = (view_key(1), view_key(2));
    for (party, key) in [(ALDER, &alder), (BIRCH, &birch)] {
        let reply = enclave.call(party, json!({ "cmd": "register_view_key", "pubkey": seal::public_b64(key) }), None);
        assert_eq!(reply["ok"], true);
    }
    let fixed = enclave.call(AGENT, json!({ "cmd": "fix_rate", "base_rate_bps": 430, "period_end": "2026-12-15" }), None);
    assert_eq!(fixed["public"]["rate_bps"], 780);
    (enclave, alder, birch)
}

#[test]
fn test_each_party_opens_only_its_own_envelope() {
    let (mut enclave, alder, birch) = open_deal();
    let reply = enclave.call(AGENT, json!({ "cmd": "request_interest", "expected_total": "197166666" }), None);
    assert_eq!(reply["public"], json!({ "request_id": 1, "total": "197166666" }));

    let mine = open(&reply, ALDER, &alder);
    assert_eq!(mine["position"]["principal"], "5000000000");
    assert_eq!(mine["interest_due"], "98583333");
    assert_eq!(mine["payments"][0]["due"], "98583333");
    assert!(!mine.to_string().contains(BIRCH) && !mine.to_string().contains("59150000"));

    // Birch cannot open Alder's envelope, and parties without a key get none.
    assert!(seal::open(&birch, reply["envelopes"][ALDER].as_str().unwrap()).is_err());
    assert_eq!(reply["envelopes"].as_object().unwrap().len(), 2);
    assert_eq!(reply["commitments"].as_object().unwrap().len(), 2);
}

/// What an outsider does with a proof: hash the fact with its salt, find the
/// result at its place in the list, hash the list and compare.
fn proves(fact: &str, salt: &[u8], hashes: &[[u8; 32]], index: usize, commitment: &Value) -> bool {
    hashes.get(index) == Some(&proofs::fact_hash(salt, fact)) && *commitment == proofs::commitment(hashes)
}

#[test]
fn test_a_party_proves_one_fact_and_shows_nothing_else() {
    let (mut enclave, alder, _) = open_deal();
    let reply = enclave.call(AGENT, json!({ "cmd": "request_interest", "expected_total": "197166666" }), None);
    let mine = open(&reply, ALDER, &alder);
    let seed = mine["proof_seed"].as_str().expect("a seed in the envelope");

    // Alder rebuilds its facts from its own envelope and arrives at the public commitment.
    let facts = proofs::facts("test-deal", &mine);
    let hashes = proofs::hashes("test-deal", &mine, seed);
    let published = &reply["commitments"][ALDER];
    assert_eq!(*published, proofs::commitment(&hashes));

    // It shows one fact: what it is owed for the first period.
    let index = facts.iter().position(|fact| fact.item == "payments.0").expect("a first payment");
    let fact = &facts[index].text;
    let value = json!({ "due": "98583333", "paid": null, "period_end": "2026-12-15", "request_id": 1, "status": "open" });
    let shown = json!({ "deal": "test-deal", "item": "payments.0", "party": ALDER, "seq": mine["seq"], "value": value });
    assert_eq!(serde_json::from_str::<Value>(fact).unwrap(), shown);
    let salt = proofs::salt(seed, "payments.0");
    assert!(proves(fact, &salt, &hashes, index, published));

    // The proof names no other fact: not Alder's position, and nothing of Birch's.
    let proof = format!("{fact}{}{}", proofs::hex(&salt), hashes.iter().map(|hash| proofs::hex(hash)).collect::<String>());
    assert!(!proof.contains("5000000000") && !proof.contains(BIRCH) && !proof.contains(seed));

    // One cent more, another fact's salt, or another party's commitment proves nothing.
    assert!(!proves(&fact.replace("98583333", "98583334"), &salt, &hashes, index, published));
    assert!(!proves(fact, &proofs::salt(seed, "cash"), &hashes, index, published));
    assert!(!proves(fact, &salt, &hashes, index, &reply["commitments"][BIRCH]));
}

/// The scripts and the web app check a proof in TypeScript
/// (near/scripts/src/lib/proofs.ts). The figures below were computed there for
/// the same view and seed, so the two cannot drift apart unnoticed.
#[test]
fn test_the_enclave_and_the_proof_checker_agree_on_a_known_view() {
    let view = json!({
        "role": "party",
        "party": "alder.paridesk.testnet",
        "seq": 7,
        "facility": { "facility_id": "NORTHWIND-TLB-2026", "name": "Northwind Logistics Term Loan B", "margin_bps": 350, "closing": "2026-09-15", "maturity": "2031-09-15" },
        "period": null,
        "rate_bps": null,
        "paid_through": "2026-12-15",
        "cash": "48583333",
        "position": { "principal": "5000000000", "accrual_start": "2026-12-15", "carried": "0" },
        "interest_due": null,
        "payments": [{ "request_id": 0, "period_end": "2026-12-15", "due": "98583333", "paid": "98583333", "status": "settled" }],
        "trades": [],
    });
    let seed = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

    let facts = proofs::facts("northwind-1", &view);
    let hashes = proofs::hashes("northwind-1", &view, seed);
    assert_eq!(facts.len(), 8);
    assert_eq!(facts[4].item, "payments.0");
    assert_eq!(
        facts[4].text,
        r#"{"deal":"northwind-1","item":"payments.0","party":"alder.paridesk.testnet","seq":7,"value":{"due":"98583333","paid":"98583333","period_end":"2026-12-15","request_id":0,"status":"settled"}}"#
    );
    assert_eq!(proofs::hex(&proofs::salt(seed, "payments.0")), "20041193547c7c024aac3410a09237ca86cf5f6b09529ca11462b8c6e3d32dc0");
    assert_eq!(proofs::hex(&hashes[4]), "438d563811c62f3f818b1564c5cda83debef101105e965255af04cd4ee260615");
    assert_eq!(proofs::commitment(&hashes), "33ce1afa8fd3511c5432da492b535744bc13f7eefb402f75a56a2b32ca975b7b");
}

#[test]
fn test_a_commitment_is_new_with_every_answer_and_confirms_no_guess() {
    let (mut enclave, alder, _) = open_deal();
    // The same command answered twice gives Alder the same view, and a new commitment.
    let request = json!({ "cmd": "request_interest", "expected_total": "197166666" });
    let first = enclave.call_too_late(AGENT, request.clone(), None);
    let second = enclave.call(AGENT, request, None);
    assert_eq!(open(&first, ALDER, &alder)["payments"], open(&second, ALDER, &alder)["payments"]);
    assert_ne!(first["commitments"][ALDER], second["commitments"][ALDER]);

    // Someone who guesses every fact in Alder's view still cannot confirm one
    // against the chain: the hashes depend on the seed inside the envelope.
    let mine = open(&second, ALDER, &alder);
    let guessed = proofs::hashes("test-deal", &mine, &proofs::random_hex());
    assert_ne!(second["commitments"][ALDER], proofs::commitment(&guessed));
    assert!(!enclave.public.contains(mine["proof_seed"].as_str().unwrap()));
}

#[test]
fn test_a_fingerprint_confirms_no_guess_at_the_books() {
    // Two deals loaded the same way hold the same books, to the cent.
    let (mut one, _, _) = open_deal();
    let (other, _, _) = open_deal();
    let books = |enclave: &Enclave| enclave.stored.offered.as_ref().unwrap().books.clone();
    let (mine, theirs) = (books(&one), books(&other));
    assert_eq!(Books { blind: String::new(), ..mine.clone() }, Books { blind: String::new(), ..theirs });

    // Their fingerprints differ all the same. Each carries 32 random bytes
    // drawn inside the enclave, so someone who guesses every position cannot
    // confirm the guess by hashing it.
    assert_ne!(one.root, other.root);
    assert_eq!(mine.blind.len(), 64);

    // Those bytes are new with every answer and never leave the enclave: they
    // are not on the chain, nor in the agent's envelope, which holds the rest.
    let agent = view_key(6);
    let reply = one.call(AGENT, json!({ "cmd": "register_view_key", "pubkey": seal::public_b64(&agent) }), None);
    let now = books(&one);
    assert_ne!(now.blind, mine.blind);
    assert!(!one.public.contains(&mine.blind) && !one.public.contains(&now.blind));
    assert!(!open(&reply, AGENT, &agent).to_string().contains(&now.blind));
}

#[test]
fn test_the_wrong_total_is_refused_and_the_books_do_not_move() {
    let (mut enclave, _, _) = open_deal();
    let before = enclave.root.clone();
    let reply = enclave.call(AGENT, json!({ "cmd": "request_interest", "expected_total": "90000000000" }), None);
    assert_eq!(reply["ok"], false);
    assert_eq!(reply["refused"], "You entered 900,000,000.00; the register says 1,971,666.66.");
    assert_eq!(reply["root"].as_str().map(String::from), before);

    // The next command builds on the same books.
    let right = enclave.call(AGENT, json!({ "cmd": "request_interest", "expected_total": "197166666" }), None);
    assert_eq!(right["ok"], true);
}

#[test]
fn test_books_the_enclave_does_not_hold_are_refused() {
    let (mut enclave, _, _) = open_deal();
    enclave.root = Some("00".into());
    let reply = enclave.call(AGENT, json!({ "cmd": "request_interest", "expected_total": "197166666" }), None);
    assert_eq!(reply["ok"], false);
    assert_eq!(reply["refused"], "the contract names books the enclave does not hold");
}

#[test]
fn test_a_sealed_offer_copied_from_the_chain_is_no_use_to_anyone_else() {
    let (mut enclave, alder, birch) = open_deal();
    let command = json!({ "cmd": "offer_trade" });
    let offer = json!({ "buyer": DELTA, "par": "1000000000", "price_ppm": 995_000, "trade_date": "2026-10-15" });
    let sealed = enclave.seal(ALDER, &command, offer);

    // Birch holds 30m, enough to make the same offer. It copies Alder's box
    // from the chain and sends it as its own, hoping to read the terms in its
    // own envelope. The box says who sealed it, so the enclave refuses.
    let refusal = "these fields were sealed for another deal, caller or command";
    let copied = enclave.request_with(BIRCH, command.clone(), Some(sealed.clone()));
    assert_eq!(enclave.run(copied)["refused"], refusal);

    // Nor does Alder's own box pass under another command, or in another deal.
    let as_dq = enclave.request_with(ALDER, json!({ "cmd": "set_dq" }), Some(sealed.clone()));
    assert_eq!(enclave.run(as_dq)["refused"], refusal);
    let mut elsewhere = enclave.request_with(ALDER, command.clone(), Some(sealed.clone()));
    elsewhere["deal"] = json!("another-deal");
    assert_eq!(enclave.run(elsewhere)["refused"], refusal);

    // Sent by Alder, the same box is an offer, and only Alder reads its terms.
    let sent = enclave.request_with(ALDER, command, Some(sealed));
    let offered = enclave.run(sent);
    assert_eq!(offered["ok"], true);
    assert_eq!(open(&offered, ALDER, &alder)["trades"][0]["price_ppm"], 995_000);
    assert_eq!(open(&offered, BIRCH, &birch)["trades"], json!([]));
}

// NEAR stops waiting for the enclave after about two minutes. An answer that
// comes later never reaches the contract, so it must count for nothing.

#[test]
fn test_an_answer_the_contract_never_received_is_not_built_on() {
    let (mut enclave, _, _) = open_deal();
    let delta = view_key(4);
    assert_eq!(enclave.call(DELTA, json!({ "cmd": "register_view_key", "pubkey": seal::public_b64(&delta) }), None)["ok"], true);

    // Delta pays in. The enclave credits it, too late: the contract has
    // already returned Delta's USDC.
    let pay_in = json!({ "cmd": "deposit", "party": DELTA, "amount": "1200000000", "purpose": { "kind": "cash" } });
    let late = enclave.call_too_late(LEDGER, pay_in, None);
    assert_eq!(open(&late, DELTA, &delta)["cash"], "1200000000");

    // The next command builds on the books the contract holds. Delta has no cash in them.
    let next = enclave.call(AGENT, json!({ "cmd": "request_interest", "expected_total": "197166666" }), None);
    assert_eq!(next["ok"], true);
    assert_eq!(open(&next, DELTA, &delta)["cash"], "0");
    let withdraw = enclave.call(DELTA, json!({ "cmd": "withdraw", "amount": "1200000000" }), None);
    assert_eq!(withdraw["ok"], false);
}

#[test]
fn test_a_late_run_cannot_undo_an_answer_the_contract_received() {
    let (mut enclave, alder, _) = open_deal();
    // The contract gives up on one request and makes another, which is answered in time.
    let pay_in = json!({ "cmd": "deposit", "party": DELTA, "amount": "1200000000", "purpose": { "kind": "cash" } });
    let abandoned = enclave.request(LEDGER, pay_in, None);
    let received = enclave.call(AGENT, json!({ "cmd": "request_interest", "expected_total": "197166666" }), None);
    assert_eq!(received["public"]["request_id"], 1);

    // Only now does the enclave get to the request the contract gave up on.
    let late = enclave.run(abandoned);
    assert_eq!(late["ok"], false);
    assert_eq!(late["refused"], "the contract has stopped waiting for this request");

    // The answer the contract received still stands, and the deal goes on from it.
    let pay = json!({ "cmd": "deposit", "party": BORROWER, "amount": "197166666", "purpose": { "kind": "pay", "request_id": 1 } });
    assert_eq!(enclave.call(LEDGER, pay, None)["ok"], true);
    let settled = enclave.call(AGENT, json!({ "cmd": "settle", "request_id": 1 }), None);
    assert_eq!(open(&settled, ALDER, &alder)["payments"][0]["paid"], "98583333");
}

#[test]
fn test_secrets_never_appear_in_public_inputs_or_replies() {
    let (mut enclave, _, _) = open_deal();
    let delta = view_key(4);
    for (party, key) in [(DELTA, view_key(4)), (BORROWER, view_key(5)), (AGENT, view_key(6)), (RIVAL, view_key(8))] {
        enclave.call(party, json!({ "cmd": "register_view_key", "pubkey": seal::public_b64(&key) }), None);
    }
    enclave.call(BORROWER, json!({ "cmd": "set_dq" }), Some(json!({ "list": [RIVAL] })));
    let fund = json!({ "cmd": "deposit", "party": DELTA, "amount": "2000000000", "purpose": { "kind": "cash" } });
    enclave.call(LEDGER, fund, None);

    let offer = json!({ "buyer": DELTA, "par": "1000000000", "price_ppm": 982_575, "trade_date": "2026-10-15" });
    assert_eq!(enclave.call(ALDER, json!({ "cmd": "offer_trade" }), Some(offer))["ok"], true);
    assert_eq!(enclave.call(DELTA, json!({ "cmd": "accept_trade", "trade_id": 1 }), None)["ok"], true);
    let settled = enclave.call(AGENT, json!({ "cmd": "settle_trade", "trade_id": 1 }), None);
    assert_eq!(settled["public"], json!({ "trade_id": 1, "settled": true }));

    // The buyer reads its trade, price included, from its own envelope.
    let mine = open(&settled, DELTA, &delta);
    assert_eq!(mine["trades"][0]["price_ppm"], 982_575);
    assert_eq!(mine["position"]["principal"], "1000000000");

    let total = "197166665"; // 853,666.66 + 132,166.66 + 591,500.00 + 394,333.33
    assert_eq!(enclave.call(AGENT, json!({ "cmd": "request_interest", "expected_total": total }), None)["ok"], true);
    let pay = json!({ "cmd": "deposit", "party": BORROWER, "amount": total, "purpose": { "kind": "pay", "request_id": 1 } });
    enclave.call(LEDGER, pay, None);
    assert_eq!(enclave.call(AGENT, json!({ "cmd": "settle", "request_id": 1 }), None)["ok"], true);

    // Positions, each lender's payment, the price and the trade's par were
    // never public; nor was the name on the DQ list as a list entry.
    let secrets = ["5000000000", "4000000000", "3000000000", "85366666", "59150000", "39433333", "13216666", "982575", "982,575"];
    for secret in secrets {
        assert!(!enclave.public.contains(secret), "{secret} appeared in public");
    }
    assert!(!enclave.public.contains(r#""list""#) && !enclave.public.contains("dq_list"));
}
