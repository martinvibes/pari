// Each persona's X25519 view key: the enclave seals that party's envelope to
// it. Kept in near/.keys (gitignored), because the demo plays every party.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { newViewKey, type ViewKey } from "./seal.js";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "../../../.keys/view-keys.json");

function load(): Record<string, ViewKey> {
  return existsSync(FILE) ? (JSON.parse(readFileSync(FILE, "utf8")) as Record<string, ViewKey>) : {};
}

/** The account's view key, created and saved on first use. */
export async function viewKeyFor(accountId: string): Promise<ViewKey> {
  const keys = load();
  const existing = keys[accountId];
  if (existing) return existing;
  const created = await newViewKey();
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify({ ...keys, [accountId]: created }, null, 2), { mode: 0o600 });
  return created;
}
