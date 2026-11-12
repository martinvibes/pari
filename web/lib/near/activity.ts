// SPDX-License-Identifier: Apache-2.0

import "server-only";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// Which transaction wrote each line of the contract's public record. The
// chain stores the record but not transaction hashes, so the server notes the
// hash of each transaction it sends. Hashes are public; nothing here is secret.

const FILE = join(process.cwd(), ".pari", "near-activity.json");

/** Where `near/scripts` records each deal it set up: the repo's own folder, or
 *  `PARI_RUNS` on a host that carries the web app alone. */
const RUNS = resolve(process.cwd(), process.env.PARI_RUNS ?? "../near/runs");

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

/** Steps that start a deal, tidy storage or propose an action to the agent's
 *  DAO, and write no line of the record. */
const UNRECORDED = new Set(["new", "sweep", "add_proposal"]);

/** The transactions `near/scripts` sent when it set the deal up: each of the
 *  others wrote one line of the record, in order. An operator's approval wrote
 *  one only when it was the approval that made the DAO act (`ran`). */
function scriptTransactions(dealId: string): Record<string, string> {
  const file = join(RUNS, `${dealId}.json`);
  if (!existsSync(file)) return {};
  const run = JSON.parse(readFileSync(file, "utf8")) as { transactions: Array<{ step: string; hash: string; ran?: string }> };
  const wrote = run.transactions.filter((t) => !UNRECORDED.has(t.step) && (t.step !== "act_proposal" || t.ran));
  return Object.fromEntries(wrote.map((t, index) => [index, t.hash]));
}
