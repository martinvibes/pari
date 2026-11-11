// SPDX-License-Identifier: Apache-2.0

import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Where the deal lives on NEAR, and the demo's keys. The demo server holds a
// testnet key for every party so one browser can play the whole deal; each
// action is still signed by the one account entitled to it.

const root = process.env.PARI_ROOT ?? "paridesk.testnet";

export const NEAR = {
  /** The network's name, as the app's header shows it. */
  network: "NEAR testnet",
  rpcUrl: process.env.NEAR_RPC_URL ?? "https://rpc.testnet.fastnear.com",
  /** A node that keeps every block, for checking a proof of any age. */
  archivalRpcUrl: process.env.NEAR_ARCHIVAL_RPC_URL ?? "https://archival-rpc.testnet.fastnear.com",
  explorerUrl: (process.env.NEAR_EXPLORER_URL ?? "https://testnet.nearblocks.io").replace(/\/$/, ""),
  root,
  /** The rules contract. */
  ledger: process.env.PARI_LEDGER ?? `ledger.${root}`,
  /** Test USDC (NEP-141, 6 decimals). */
  usdc: process.env.PARI_USDC ?? `usdc.${root}`,
};

/** Test USDC base units in one cent. The books keep cents. */
export const UNITS_PER_CENT = 10_000n;

/** A persona's NEAR account: `alder` → `alder.paridesk.testnet`. */
export function accountOf(personaId: string): string {
  return `${personaId}.${NEAR.root}`;
}

/** Sputnik DAO's factory on testnet. A deal set up with `--dao` (near/scripts)
 *  has a DAO made by it as its agent, with these three operators: each of the
 *  agent's actions is a proposal, and it runs when two of them have approved. */
export const DAO_FACTORY = "sputnikv2.testnet";
export const OPERATORS = ["op1", "op2", "op3"];

/** The persona id an account belongs to, if it is one of the cast's. */
export function personaIdOf(account: string): string | null {
  const suffix = `.${NEAR.root}`;
  return account.endsWith(suffix) ? account.slice(0, -suffix.length) : null;
}

export function txUrl(hash: string): string {
  return `${NEAR.explorerUrl}/txns/${hash}`;
}

export function accountUrl(account: string): string {
  return `${NEAR.explorerUrl}/address/${account}`;
}

export class KeyMissingError extends Error {}

function fromEnv(prefix: string, personaId: string): string | undefined {
  return process.env[`${prefix}_${personaId.toUpperCase()}`];
}

/** The key a persona signs with: `NEAR_KEY_<PERSONA>` in the environment, or
 *  the near CLI keychain, where `near/scripts` setup writes it. */
export function signingKey(personaId: string): string {
  const key = fromEnv("NEAR_KEY", personaId);
  if (key) return key;
  const file = join(homedir(), ".near-credentials", "testnet", `${accountOf(personaId)}.json`);
  if (!existsSync(file)) throw new KeyMissingError(`No signing key for ${accountOf(personaId)} on this server.`);
  return (JSON.parse(readFileSync(file, "utf8")) as { private_key: string }).private_key;
}

/** The private half of a persona's view key (X25519, base64), which opens its
 *  envelope: `VIEW_KEY_<PERSONA>` in the environment, or the file setup writes,
 *  which keeps one key per account. */
export function viewKey(personaId: string, account: string = accountOf(personaId)): string {
  const key = fromEnv("VIEW_KEY", personaId);
  if (key) return key;
  const file = process.env.PARI_VIEW_KEYS ?? join(process.cwd(), "..", "near", ".keys", "view-keys.json");
  const keys = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, { privateKey: string }>) : {};
  const found = keys[account];
  if (!found) throw new KeyMissingError(`No view key for ${account} on this server.`);
  return found.privateKey;
}

/** Whether this server can sign and open envelopes as `personaId`. A server
 *  without the demo's keys still shows what the public can read. */
export function holdsKeysFor(personaId: string): boolean {
  try {
    signingKey(personaId);
    viewKey(personaId);
    return true;
  } catch (error) {
    if (error instanceof KeyMissingError) return false;
    throw error;
  }
}
