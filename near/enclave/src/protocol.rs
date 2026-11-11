//! What the rules contract sends the enclave and what it gets back.
//!
//! In:  `{ deal, caller, prev_root, turn, command, sealed }`. `command` is
//!      public; `sealed` is a box only the enclave can open, holding the
//!      command's secret fields (a trade's price, the DQ list, the opening
//!      positions) and the deal, the caller and the command they are for.
//! Out: `{ ok: true, root, seq, public, payouts, envelopes, commitments }`, or
//!      `{ ok: false, refused, root }` with the books untouched.
//!
//! Each envelope is one party's whole view, sealed to that party's key. Each
//! commitment is public and lets that party prove one fact from its view to
//! an outsider (see `proofs`).

use crate::books::{step, Books, Command};
use crate::seal::{self, SecretKey};
use crate::{proofs, views};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

#[derive(Deserialize)]
pub struct Input {
    /// Names the books in the enclave's storage. Fixed by the rules contract.
    pub deal: String,
    /// The account the rules contract vouches for.
    pub caller: String,
    /// The fingerprint the contract holds: the books to build on.
    pub prev_root: Option<String>,
    /// How many requests the contract had made before this one.
    pub turn: u64,
    pub command: Map<String, Value>,
    pub sealed: Option<String>,
}

/// What the enclave keeps for one deal.
///
/// The enclave answers before it can know whether the contract received the
/// answer: NEAR stops waiting after about two minutes, and an answer that
/// comes later is dropped. So the enclave never builds on its own last
/// answer. It builds on the books whose fingerprint the contract sends, and
/// the contract holds a fingerprint only if it received the answer.
#[derive(Default, Serialize, Deserialize)]
pub struct Stored {
    /// The newest books the contract has shown it holds.
    pub received: Option<Books>,
    /// The enclave's latest answer. The contract may never have received it.
    pub offered: Option<Offer>,
}

#[derive(Serialize, Deserialize)]
pub struct Offer {
    /// The request this answers. The contract makes one request at a time, so
    /// it has stopped waiting for every request with a lower number.
    pub turn: u64,
    pub books: Books,
}

pub struct Reply {
    /// What to store, when the command changed the books.
    pub save: Option<Stored>,
    pub output: Value,
}

impl Reply {
    fn refused(reason: impl Into<String>, root: Option<String>) -> Reply {
        Reply { save: None, output: json!({ "ok": false, "refused": reason.into(), "root": root }) }
    }
}

pub fn handle(stored: &Stored, input: Input, enclave: &SecretKey) -> Reply {
    // Anyone may learn the key that secrets are sealed to.
    if input.command.get("cmd").and_then(Value::as_str) == Some("pubkey") {
        return Reply { save: None, output: json!({ "ok": true, "public": { "pubkey": seal::public_b64(enclave) } }) };
    }
    let root = input.prev_root.clone();
    let offered = stored.offered.as_ref();
    // A request the contract no longer waits for must not replace the answer
    // to a later one, which the contract may have received.
    if offered.is_some_and(|offer| input.turn < offer.turn) {
        return Reply::refused("the contract has stopped waiting for this request", root);
    }
    let books = match offered {
        _ if root == stored.received.as_ref().map(Books::root) => stored.received.as_ref(),
        Some(offer) if root == Some(offer.books.root()) => Some(&offer.books),
        _ => return Reply::refused("the contract names books the enclave does not hold", root),
    };
    let command = match parse(&input.deal, &input.caller, input.command, input.sealed.as_deref(), enclave) {
        Ok(command) => command,
        Err(reason) => return Reply::refused(reason, root),
    };
    match step(books, &input.caller, command) {
        Ok((mut next, outcome)) => {
            next.blind = proofs::random_hex();
            let output = answer(&input.deal, &next, outcome.public, json!(outcome.payouts));
            let save = Stored { received: books.cloned(), offered: Some(Offer { turn: input.turn, books: next }) };
            Reply { save: Some(save), output }
        }
        Err(refusal) => Reply::refused(refusal.0, root),
    }
}

/// Opens the sealed fields and joins them to the public ones.
///
/// A sealed box names no sender, and it sits on the public chain where anyone
/// can copy it. So the fields inside say which deal, which caller and which
/// command they were sealed for, and the enclave refuses a box that arrives
/// any other way. Without that, a lender could send another lender's sealed
/// offer as its own and read the price in its own envelope.
fn parse(deal: &str, caller: &str, mut command: Map<String, Value>, sealed: Option<&str>, enclave: &SecretKey) -> Result<Command, String> {
    if let Some(sealed) = sealed {
        let mut secret: Map<String, Value> =
            serde_json::from_slice(&seal::open(enclave, sealed)?).map_err(|_| "the sealed fields are not a JSON object")?;
        let sealed_for = [("deal", Some(deal)), ("caller", Some(caller)), ("cmd", command.get("cmd").and_then(Value::as_str))];
        if sealed_for.iter().any(|(field, expected)| expected.is_none() || secret.remove(*field).as_ref().and_then(Value::as_str) != *expected) {
            return Err("these fields were sealed for another deal, caller or command".into());
        }
        command.extend(secret);
    }
    let command: Command = serde_json::from_value(Value::Object(command)).map_err(|_| "the command is not well formed")?;
    if let Command::RegisterViewKey { pubkey } = &command {
        seal::public_key(pubkey)?;
    }
    Ok(command)
}

/// The public answer, with one envelope and one commitment for each party
/// that has registered a key.
fn answer(deal: &str, books: &Books, public: Value, payouts: Value) -> Value {
    let mut envelopes = Map::new();
    let mut commitments = Map::new();
    for (party, mut view) in views::all(books) {
        let Some(key) = books.view_keys.get(&party).and_then(|key| seal::public_key(key).ok()) else { continue };
        let seed = proofs::random_hex();
        let commitment = proofs::commitment(&proofs::hashes(deal, &view, &seed));
        view[proofs::SEED_FIELD] = Value::String(seed);
        let Ok(sealed) = seal::seal(&key, view.to_string().as_bytes()) else { continue };
        envelopes.insert(party.clone(), Value::String(sealed));
        commitments.insert(party, Value::String(commitment));
    }
    json!({
        "ok": true,
        "root": books.root(),
        "seq": books.seq,
        "public": public,
        "payouts": payouts,
        "envelopes": envelopes,
        "commitments": commitments,
    })
}
