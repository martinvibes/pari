//! Go/no-go spike for Pari on NEAR.
//!
//! Spike 1: a counter in OutLayer worker storage, returned with the sha256 of
//! the stored state. Spike 2: an X25519 key the module derives from a keystore
//! key it never sees, a sealed box opened inside the enclave, and a reply sealed
//! to a key the client names.
//!
//! The module answers only runs started on chain by the spike contract.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use crypto_box::{aead::rand_core, PublicKey, SecretKey};
use outlayer::{encryption_keys, env, storage};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

/// The keystore derives the `enclave` key from (this project, the calling
/// contract): only runs the spike contract starts can derive it.
#[cfg(target_arch = "wasm32")]
#[used]
#[link_section = "outlayer.manifest"]
static OUTLAYER_MANIFEST: [u8; include_bytes!("../manifest.json").len()] =
    *include_bytes!("../manifest.json");

/// The one contract allowed to run this module, fixed at build time.
const ALLOWED_CALLER: &str = env!("PARI_SPIKE_CONTRACT");

const COUNTER_KEY: &str = "spike:counter";
const X25519_LABEL: &[u8] = b"pari:enclave-x25519:v1";

#[derive(Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
enum Command {
    Count,
    Pubkey,
    EchoSealed { sealed: String, reply_to: String },
}

fn main() {
    let out = match run() {
        Ok(v) => json!({ "ok": true, "result": v }),
        Err(e) => json!({ "ok": false, "error": e }),
    };
    // Output is the only channel back; a serialization failure leaves it empty.
    let _ = env::output_json(&out);
}

fn run() -> Result<Value, String> {
    check_caller()?;
    let cmd: Command = env::input_json()
        .map_err(|e| format!("bad input: {e}"))?
        .ok_or("no input")?;
    match cmd {
        Command::Count => count(),
        Command::Pubkey => Ok(json!({ "pubkey": B64.encode(enclave_key()?.public_key().as_bytes()) })),
        Command::EchoSealed { sealed, reply_to } => echo_sealed(&sealed, &reply_to),
    }
}

fn check_caller() -> Result<(), String> {
    let kind = env::var("OUTLAYER_EXECUTION_TYPE").unwrap_or_default();
    let predecessor = env::predecessor_account_id().unwrap_or_default();
    if kind != "NEAR" || predecessor != ALLOWED_CALLER {
        return Err(format!("refused: only {ALLOWED_CALLER} may run this (got {kind} from '{predecessor}')"));
    }
    Ok(())
}

fn count() -> Result<Value, String> {
    let current = storage::get_worker(COUNTER_KEY)
        .map_err(|e| e.to_string())?
        .map(|b| u64::from_le_bytes(b.try_into().unwrap_or([0; 8])))
        .unwrap_or(0);
    let next = current + 1;
    let state = next.to_le_bytes();
    storage::set_worker(COUNTER_KEY, &state).map_err(|e| e.to_string())?;
    Ok(json!({
        "count": next,
        "state_sha256": hex(&Sha256::digest(state)),
        "predecessor": env::predecessor_account_id(),
        "signer": env::signer_account_id(),
        "project": env::var("OUTLAYER_PROJECT_ID"),
        "tx": env::transaction_hash(),
    }))
}

fn echo_sealed(sealed: &str, reply_to: &str) -> Result<Value, String> {
    let ciphertext = B64.decode(sealed).map_err(|e| format!("sealed: {e}"))?;
    let plaintext = enclave_key()?
        .unseal(&ciphertext)
        .map_err(|_| "could not open the sealed box".to_string())?;
    let message: Value = serde_json::from_slice(&plaintext).map_err(|e| format!("sealed json: {e}"))?;

    let recipient = public_key(reply_to)?;
    let reply = json!({ "enclave_read": message, "signer": env::signer_account_id() });
    let sealed_reply = recipient
        .seal(&mut OsRng, reply.to_string().as_bytes())
        .map_err(|_| "could not seal the reply".to_string())?;
    Ok(json!({ "reply": B64.encode(sealed_reply) }))
}

/// X25519 secret = sha256(MAC under the keystore's `enclave` key). The module
/// sees only the MAC output; the key itself never leaves the keystore.
fn enclave_key() -> Result<SecretKey, String> {
    let tag = encryption_keys::mac("enclave", None, X25519_LABEL).map_err(|e| e.to_string())?;
    let bytes: [u8; 32] = Sha256::digest(&tag).into();
    Ok(SecretKey::from(bytes))
}

fn public_key(b64: &str) -> Result<PublicKey, String> {
    let bytes: [u8; 32] = B64
        .decode(b64)
        .map_err(|e| format!("reply_to: {e}"))?
        .try_into()
        .map_err(|_| "reply_to must be 32 bytes".to_string())?;
    Ok(PublicKey::from(bytes))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// The host's CSPRNG (wasi:random on wasip2), in the trait crypto_box takes.
struct OsRng;

impl rand_core::RngCore for OsRng {
    fn next_u32(&mut self) -> u32 {
        let mut b = [0u8; 4];
        self.fill_bytes(&mut b);
        u32::from_le_bytes(b)
    }
    fn next_u64(&mut self) -> u64 {
        let mut b = [0u8; 8];
        self.fill_bytes(&mut b);
        u64::from_le_bytes(b)
    }
    fn fill_bytes(&mut self, dest: &mut [u8]) {
        getrandom::fill(dest).expect("host randomness unavailable");
    }
    fn try_fill_bytes(&mut self, dest: &mut [u8]) -> Result<(), rand_core::Error> {
        self.fill_bytes(dest);
        Ok(())
    }
}

impl rand_core::CryptoRng for OsRng {}
