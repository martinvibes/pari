// Sealed boxes (libsodium crypto_box_seal: X25519 + XSalsa20-Poly1305).
// The enclave uses the same construction through the crypto_box crate.

import sodium from "libsodium-wrappers";

export interface ViewKey {
  publicKey: string; // base64
  privateKey: string; // base64
}

export async function newViewKey(): Promise<ViewKey> {
  await sodium.ready;
  const kp = sodium.crypto_box_keypair();
  return { publicKey: b64(kp.publicKey), privateKey: b64(kp.privateKey) };
}

export async function seal(plaintext: string, recipientPublicKey: string): Promise<string> {
  await sodium.ready;
  return b64(sodium.crypto_box_seal(sodium.from_string(plaintext), unb64(recipientPublicKey)));
}

export async function open(sealed: string, key: ViewKey): Promise<string> {
  await sodium.ready;
  return sodium.to_string(sodium.crypto_box_seal_open(unb64(sealed), unb64(key.publicKey), unb64(key.privateKey)));
}

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function unb64(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "base64"));
}
