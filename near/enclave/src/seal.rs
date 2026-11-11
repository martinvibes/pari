//! Sealed boxes: libsodium's `crypto_box_seal` (X25519 + XSalsa20-Poly1305).
//! Parties seal secrets to the enclave's key; the enclave seals each party's
//! view to that party's key. The TypeScript side uses libsodium itself.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use crypto_box::aead::rand_core;
pub use crypto_box::{PublicKey, SecretKey};

/// Reads a base64 X25519 public key.
pub fn public_key(b64: &str) -> Result<PublicKey, String> {
    let bytes: [u8; 32] = B64
        .decode(b64)
        .map_err(|_| "a public key is 32 bytes in base64")?
        .try_into()
        .map_err(|_| "a public key is 32 bytes in base64")?;
    Ok(PublicKey::from(bytes))
}

pub fn public_b64(key: &SecretKey) -> String {
    B64.encode(key.public_key().as_bytes())
}

/// Seals `plaintext` so only the holder of `to`'s secret key can open it.
pub fn seal(to: &PublicKey, plaintext: &[u8]) -> Result<String, String> {
    let sealed = to.seal(&mut OsRng, plaintext).map_err(|_| "could not seal")?;
    Ok(B64.encode(sealed))
}

pub fn open(key: &SecretKey, sealed_b64: &str) -> Result<Vec<u8>, String> {
    let sealed = B64.decode(sealed_b64).map_err(|_| "sealed data is base64")?;
    key.unseal(&sealed).map_err(|_| "could not open the sealed data".to_string())
}

/// The host's CSPRNG (wasi:random inside the enclave), in the trait crypto_box takes.
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
