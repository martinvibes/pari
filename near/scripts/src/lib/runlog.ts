// A public record of every transaction the scripts send to the deal, kept per
// deal in near/runs. The leak test reads it to know which transactions to
// search. It holds transaction hashes only, never keys or secrets.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface RunEntry {
  step: string;
  signer: string;
  hash: string;
}

export interface RunLog {
  deal_id: string;
  ledger: string;
  transactions: RunEntry[];
}

export const RUNS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../runs");

export function runFile(dealId: string): string {
  return join(RUNS_DIR, `${dealId}.json`);
}

export function readRun(dealId: string): RunLog | null {
  return existsSync(runFile(dealId)) ? (JSON.parse(readFileSync(runFile(dealId), "utf8")) as RunLog) : null;
}

export function record(dealId: string, ledger: string, entry: RunEntry): void {
  const run = readRun(dealId) ?? { deal_id: dealId, ledger, transactions: [] };
  run.transactions.push(entry);
  mkdirSync(RUNS_DIR, { recursive: true });
  writeFileSync(runFile(dealId), `${JSON.stringify(run, null, 2)}\n`);
}
