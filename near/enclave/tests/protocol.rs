//! The enclave's protocol end to end, on this machine: secrets go in sealed,
//! each party's view comes out sealed, and the public reply shows neither.

mod common;

use common::*;
use pari_core::books::Books;
use pari_core::proofs;
use pari_core::protocol::{handle, Input};
use pari_core::seal::{self, SecretKey};
use serde_json::{json, Value};

/// The enclave side of a deal: the stored books and the enclave's key.
struct Enclave {
    key: SecretKey,
    books: Option<Books>,
    /// Everything that has gone on the public chain: inputs and replies.
    public: String,
}

impl Enclave {
    fn new() -> Enclave {
        Enclave { key: SecretKey::from([7u8; 32]), books: None, public: String::new() }
    }

    fn root(&self) -> Option<String> {
        self.books.as_ref().map(Books::root)
    }

    /// Sends a command the way the rules contract does. `secret` is sealed to
    /// the enclave before it leaves the caller.
    fn call(&mut self, caller: &str, command: Value, secret: Option<Value>) -> Value {
        let enclave_key = seal::public_key(&seal::public_b64(&self.key)).unwrap();
        let sealed = secret.map(|s| seal::seal(&enclave_key, s.to_string().as_bytes()).unwrap());
        let input = json!({ "deal": "test-deal", "caller": caller, "prev_root": self.root(), "command": command, "sealed": sealed });
        self.public.push_str(&input.to_string());
        let reply = handle(self.books.as_ref(), serde_json::from_value::<Input>(input).unwrap(), &self.key);
        if let Some(next) = reply.save {
            self.books = Some(next);
        }
        self.public.push_str(&reply.output.to_string());
        reply.output
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

#[test]
fn test_a_commitment_is_new_with_every_answer_and_confirms_no_guess() {
    let (mut enclave, alder, _) = open_deal();
    // The same books answered twice: the same root, and a new commitment.
    let first = enclave.call(LEDGER, json!({ "cmd": "sync" }), None);
    let second = enclave.call(LEDGER, json!({ "cmd": "sync" }), None);
    assert_eq!(first["root"], second["root"]);
    assert_ne!(first["commitments"][ALDER], second["commitments"][ALDER]);

    // Someone who guesses every fact in Alder's view still cannot confirm one
    // against the chain: the hashes depend on the seed inside the envelope.
    let mine = open(&second, ALDER, &alder);
    let guessed = proofs::hashes("test-deal", &mine, &proofs::new_seed());
    assert_ne!(second["commitments"][ALDER], proofs::commitment(&guessed));
    assert!(!enclave.public.contains(mine["proof_seed"].as_str().unwrap()));
}

#[test]
fn test_the_wrong_total_is_refused_and_the_books_do_not_move() {
    let (mut enclave, _, _) = open_deal();
    let before = enclave.root();
    let reply = enclave.call(AGENT, json!({ "cmd": "request_interest", "expected_total": "90000000000" }), None);
    assert_eq!(reply["ok"], false);
    assert_eq!(reply["refused"], "You entered 900,000,000.00; the register says 1,971,666.66.");
    assert_eq!(reply["root"].as_str().map(String::from), before);
    assert_eq!(enclave.root(), before);
}

#[test]
fn test_a_stale_root_is_refused_and_sync_reports_the_current_one() {
    let (mut enclave, _, _) = open_deal();
    let stale = json!({ "deal": "test-deal", "caller": AGENT, "prev_root": "00", "command": { "cmd": "request_interest", "expected_total": "197166666" }, "sealed": null });
    let reply = handle(enclave.books.as_ref(), serde_json::from_value(stale).unwrap(), &enclave.key);
    assert_eq!(reply.output["ok"], false);
    assert!(reply.save.is_none());

    let synced = enclave.call(LEDGER, json!({ "cmd": "sync" }), None);
    assert_eq!(synced["root"].as_str().map(String::from), enclave.root());
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
