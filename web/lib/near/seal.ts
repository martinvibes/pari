// SPDX-License-Identifier: Apache-2.0

import "server-only";
import sodium from "libsodium-wrappers";

// Sealed boxes (libsodium crypto_box_seal: X25519 + XSalsa20-Poly1305), the
// same construction the enclave uses through the crypto_box crate.

/** Seals `plaintext` so only the holder of `publicKey` (base64) can read it. */
export async function seal(plaintext: string, publicKey: string): Promise<string> {
  await sodium.ready;
  return Buffer.from(sodium.crypto_box_seal(sodium.from_string(plaintext), unb64(publicKey))).toString("base64");
}

/** Opens a sealed box with the private key (base64) it was sealed to. */
export async function open(sealed: string, privateKey: string): Promise<string> {
  await sodium.ready;
  const secret = unb64(privateKey);
  return sodium.to_string(sodium.crypto_box_seal_open(unb64(sealed), sodium.crypto_scalarmult_base(secret), secret));
}

function unb64(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "base64"));
}
