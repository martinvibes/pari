// SPDX-License-Identifier: Apache-2.0

import "server-only";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Which transaction wrote each line of the contract's public record. The
// chain stores the record but not transaction hashes, so the server notes the
// hash of each transaction it sends. Hashes are public; nothing here is secret.

const FILE = join(process.cwd(), ".pari", "near-activity.json");

type Activity = Record<string, Record<string, string>>;

function load(): Activity {
  return existsSync(FILE) ? (JSON.parse(readFileSync(FILE, "utf8")) as Activity) : {};
}

/** Notes that `hash` wrote line `index` of deal `dealId`'s public record. */
export function noteTransaction(dealId: string, index: number, hash: string): void {
  const activity = load();
  activity[dealId] = { ...activity[dealId], [index]: hash };
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(activity, null, 2));
}

/** Transaction hashes by line of the public record, where this server knows them. */
export function transactionsOf(dealId: string): Record<string, string> {
  return { ...scriptTransactions(dealId), ...load()[dealId] };
}

/** The transactions `near/scripts` sent when it set the deal up: every one
 *  after the first (`new`) wrote one line of the record, in order. */
function scriptTransactions(dealId: string): Record<string, string> {
  const file = join(process.cwd(), "..", "near", "runs", `${dealId}.json`);
  if (!existsSync(file)) return {};
  const run = JSON.parse(readFileSync(file, "utf8")) as { transactions: Array<{ step: string; hash: string }> };
  return Object.fromEntries(run.transactions.filter((t) => t.step !== "new").map((t, index) => [index, t.hash]));
}
