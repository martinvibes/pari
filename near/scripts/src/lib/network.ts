// Testnet connection and signing accounts for the scripts.
//
// Keys are read from the near CLI's legacy keychain (~/.near-credentials),
// where setup writes them; nothing secret lives in the repository.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Account, JsonRpcProvider, type KeyPairString } from "near-api-js";

export const NETWORK = "testnet";
// Public testnet RPC (docs.near.org/api/rpc/providers); OutLayer uses the same.
export const RPC_URL = process.env.NEAR_RPC_URL ?? "https://rpc.testnet.fastnear.com";
export const EXPLORER_URL = process.env.NEAR_EXPLORER_URL ?? "https://testnet.nearblocks.io";

export const provider = new JsonRpcProvider({ url: RPC_URL });

export function txUrl(hash: string): string {
  return `${EXPLORER_URL}/txns/${hash}`;
}

export function keyFor(accountId: string): KeyPairString {
  const path = join(homedir(), ".near-credentials", NETWORK, `${accountId}.json`);
  const { private_key } = JSON.parse(readFileSync(path, "utf8")) as { private_key: KeyPairString };
  return private_key;
}

export function accountFor(accountId: string): Account {
  return new Account(accountId, provider, keyFor(accountId));
}
