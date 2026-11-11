//! Proofs a party can hand to an outsider.
//!
//! A party's view is cut into facts: one for each field, and one for each
//! entry of a list (each payment, each trade). The enclave hashes every fact
//! with a salt of its own and publishes one commitment per party: the sha256
//! of those hashes, in order. The salts come from a random seed that travels
//! inside the party's sealed envelope and nowhere else.
//!
//! To prove one fact, the party shows the fact, its salt and the list of
//! hashes. Anyone can hash the fact, find the result in the list, hash the
//! list and compare that with the commitment the chain holds. The other
//! hashes are salted, so they say nothing about the facts behind them.

use hmac::{Hmac, Mac};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

/// The envelope field that carries the seed.
pub const SEED_FIELD: &str = "proof_seed";
/// Fields that say whose view it is. Every fact repeats them, so they are not
/// facts of their own; nor is the seed.
const NOT_FACTS: [&str; 4] = ["party", "role", "seq", SEED_FIELD];

/// One statement a party can prove.
pub struct Fact {
    /// Where the value sits in the view: `cash`, `position`, `payments.0`.
    pub item: String,
    /// What gets hashed: the canonical JSON of `{deal, item, party, seq, value}`.
    pub text: String,
}

/// A view's facts, in item order.
pub fn facts(deal: &str, view: &Value) -> Vec<Fact> {
    let mut facts = Vec::new();
    let mut add = |item: String, value: &Value| {
        let text = canonical(&json!({ "deal": deal, "item": item, "party": view["party"], "seq": view["seq"], "value": value }));
        facts.push(Fact { item, text });
    };
    for (field, value) in view.as_object().into_iter().flatten() {
        match value {
            _ if NOT_FACTS.contains(&field.as_str()) => {}
            Value::Array(entries) => entries.iter().enumerate().for_each(|(index, entry)| add(format!("{field}.{index}"), entry)),
            whole => add(field.clone(), whole),
        }
    }
    facts.sort_by(|a, b| a.item.cmp(&b.item));
    facts
}

/// A fresh random seed, in hex. The enclave draws one for every envelope.
pub fn new_seed() -> String {
    let mut seed = [0u8; 32];
    getrandom::fill(&mut seed).expect("host randomness unavailable");
    hex(&seed)
}

/// One fact's salt: HMAC-SHA256 of its item, keyed by the seed's text. Showing
/// one salt gives away neither the seed nor any other salt.
pub fn salt(seed: &str, item: &str) -> [u8; 32] {
    let mut mac = Hmac::<Sha256>::new_from_slice(seed.as_bytes()).expect("HMAC takes a key of any length");
    mac.update(item.as_bytes());
    mac.finalize().into_bytes().into()
}

/// sha256 of the salt, then the fact's text.
pub fn fact_hash(salt: &[u8], text: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(salt);
    hasher.update(text.as_bytes());
    hasher.finalize().into()
}

/// The hash of every fact in the view, in item order.
pub fn hashes(deal: &str, view: &Value, seed: &str) -> Vec<[u8; 32]> {
    facts(deal, view).iter().map(|fact| fact_hash(&salt(seed, &fact.item), &fact.text)).collect()
}

/// The public commitment: sha256 of the facts' hashes laid end to end, in hex.
pub fn commitment(hashes: &[[u8; 32]]) -> String {
    hex(&Sha256::digest(hashes.concat()))
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// JSON with every object's keys in order and no spaces, so that the enclave
/// and a checker in any language write the same bytes for the same value.
pub fn canonical(value: &Value) -> String {
    match value {
        Value::Object(fields) => {
            let mut keys: Vec<&String> = fields.keys().collect();
            keys.sort();
            let body: Vec<String> = keys.into_iter().map(|key| format!("{}:{}", Value::String(key.clone()), canonical(&fields[key]))).collect();
            format!("{{{}}}", body.join(","))
        }
        Value::Array(entries) => format!("[{}]", entries.iter().map(canonical).collect::<Vec<_>>().join(",")),
        scalar => scalar.to_string(),
    }
}
