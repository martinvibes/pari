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
  /** On a DAO operator's approval that made the DAO act: the ledger method it ran. */
  ran?: string;
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

/** The proof the end-to-end run leaves for each deal: see verify-proof.ts. */
export const PROOFS_DIR = join(RUNS_DIR, "../proofs");

export function proofFile(dealId: string): string {
  return join(PROOFS_DIR, `${dealId}.json`);
}

export function saveProof(dealId: string, proof: object): void {
  mkdirSync(PROOFS_DIR, { recursive: true });
  writeFileSync(proofFile(dealId), `${JSON.stringify(proof, null, 2)}\n`);
}

export function record(dealId: string, ledger: string, entry: RunEntry): void {
  const run = readRun(dealId) ?? { deal_id: dealId, ledger, transactions: [] };
  run.transactions.push(entry);
  mkdirSync(RUNS_DIR, { recursive: true });
  writeFileSync(runFile(dealId), `${JSON.stringify(run, null, 2)}\n`);
}
