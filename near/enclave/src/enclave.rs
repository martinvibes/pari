//! Runs one command inside the OutLayer TDX enclave.
//!
//! The books are kept in the project's worker storage, encrypted under a key
//! the keystore derives from (this project, the calling contract). Only a run
//! the rules contract starts on chain can read them, and the module refuses
//! every other caller as well.

use outlayer::{encryption_keys, env, storage};
use pari_core::books::Books;
use pari_core::protocol::{handle, Input};
use pari_core::seal::SecretKey;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

#[used]
#[link_section = "outlayer.manifest"]
static OUTLAYER_MANIFEST: [u8; include_bytes!("../manifest.json").len()] = *include_bytes!("../manifest.json");

/// The rules contract, fixed when this module is built. The build's hash
/// therefore commits to the one contract that can run it.
const LEDGER: &str = env!("PARI_LEDGER");

const KEY_PATH: &str = "enclave";
const BOOKS_AAD: &[u8] = b"pari:books:v1";
const X25519_LABEL: &[u8] = b"pari:enclave-x25519:v1";

pub fn run() {
    let output = match answer() {
        Ok(output) => output,
        Err(error) => json!({ "ok": false, "error": error }),
    };
    // Output is the only channel back; a serialization failure leaves it empty.
    let _ = env::output_json(&output);
}

fn answer() -> Result<Value, String> {
    let kind = env::var("OUTLAYER_EXECUTION_TYPE").unwrap_or_default();
    let predecessor = env::predecessor_account_id().unwrap_or_default();
    if kind != "NEAR" || predecessor != LEDGER {
        return Err(format!("only {LEDGER} may run the books"));
    }
    let input: Input = env::input_json().map_err(|e| format!("bad input: {e}"))?.ok_or("no input")?;
    if input.deal.is_empty() || input.deal.len() > 64 || !input.deal.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
        return Err("a deal id is up to 64 letters, digits and dashes".into());
    }
    let key = format!("books:{}", input.deal);
    let books = load(&key)?;
    let reply = handle(books.as_ref(), input, &enclave_key()?);
    if let Some(next) = &reply.save {
        save(&key, next)?;
    }
    Ok(reply.output)
}

fn load(key: &str) -> Result<Option<Books>, String> {
    let Some(sealed) = storage::get_worker(key).map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    let bytes = encryption_keys::decrypt(KEY_PATH, None, &sealed, BOOKS_AAD).map_err(|e| e.to_string())?;
    serde_json::from_slice(&bytes).map(Some).map_err(|e| format!("stored books: {e}"))
}

fn save(key: &str, books: &Books) -> Result<(), String> {
    let bytes = serde_json::to_vec(books).map_err(|e| e.to_string())?;
    let sealed = encryption_keys::encrypt(KEY_PATH, None, &bytes, BOOKS_AAD).map_err(|e| e.to_string())?;
    storage::set_worker(key, &sealed).map_err(|e| e.to_string())
}

/// X25519 secret = sha256(MAC under the keystore's key). The module sees only
/// the MAC output; the key itself never leaves the keystore.
fn enclave_key() -> Result<SecretKey, String> {
    let tag = encryption_keys::mac(KEY_PATH, None, X25519_LABEL).map_err(|e| e.to_string())?;
    let seed: [u8; 32] = Sha256::digest(&tag).into();
    Ok(SecretKey::from(seed))
}
