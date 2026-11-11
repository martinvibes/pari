//! What the rules contract sends the enclave and what it gets back.
//!
//! In:  `{ deal, caller, prev_root, command, sealed }`. `command` is public;
//!      `sealed` is a box only the enclave can open, holding the command's
//!      secret fields (a trade's price, the DQ list, the opening positions).
//! Out: `{ ok: true, root, seq, public, payouts, envelopes, commitments }`, or
//!      `{ ok: false, refused, root }` with the books untouched.
//!
//! Each envelope is one party's whole view, sealed to that party's key. Each
//! commitment is public and lets that party prove one fact from its view to
//! an outsider (see `proofs`).

use crate::books::{step, Books, Command};
use crate::seal::{self, SecretKey};
use crate::{proofs, views};
use serde::Deserialize;
use serde_json::{json, Map, Value};

#[derive(Deserialize)]
pub struct Input {
    /// Names the books in the enclave's storage. Fixed by the rules contract.
    pub deal: String,
    /// The account the rules contract vouches for.
    pub caller: String,
    /// The fingerprint the contract holds. The books must match it.
    pub prev_root: Option<String>,
    pub command: Map<String, Value>,
    pub sealed: Option<String>,
}

pub struct Reply {
    /// The new books to store, when the command changed them.
    pub save: Option<Books>,
    pub output: Value,
}

impl Reply {
    fn refused(reason: impl Into<String>, root: Option<String>) -> Reply {
        Reply { save: None, output: json!({ "ok": false, "refused": reason.into(), "root": root }) }
    }
}

pub fn handle(books: Option<&Books>, input: Input, enclave: &SecretKey) -> Reply {
    let root = books.map(Books::root);
    match input.command.get("cmd").and_then(Value::as_str) {
        // Anyone may learn the key that secrets are sealed to.
        Some("pubkey") => {
            return Reply { save: None, output: json!({ "ok": true, "root": root, "public": { "pubkey": seal::public_b64(enclave) } }) }
        }
        // Lets the contract catch up if a callback was lost after the books moved.
        Some("sync") => {
            return match books {
                Some(books) => Reply { save: None, output: answer(&input.deal, books, json!({}), json!([])) },
                None => Reply::refused("the deal has not been set up", None),
            }
        }
        _ => {}
    }
    if input.prev_root != root {
        return Reply::refused("the books have moved on; sync and try again", root);
    }
    let command = match parse(input.command, input.sealed.as_deref(), enclave) {
        Ok(command) => command,
        Err(reason) => return Reply::refused(reason, root),
    };
    match step(books, &input.caller, command) {
        Ok((next, outcome)) => {
            let output = answer(&input.deal, &next, outcome.public, json!(outcome.payouts));
            Reply { save: Some(next), output }
        }
        Err(refusal) => Reply::refused(refusal.0, root),
    }
}

/// Opens the sealed fields and joins them to the public ones.
fn parse(mut command: Map<String, Value>, sealed: Option<&str>, enclave: &SecretKey) -> Result<Command, String> {
    if let Some(sealed) = sealed {
        let secret: Map<String, Value> =
            serde_json::from_slice(&seal::open(enclave, sealed)?).map_err(|_| "the sealed fields are not a JSON object")?;
        if secret.contains_key("cmd") {
            return Err("the command name is public".into());
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
        let seed = proofs::new_seed();
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
