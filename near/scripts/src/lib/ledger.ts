// Calling the rules contract: public reads, actions signed by one party, and
// opening a party's envelope.

import { teraToGas } from "near-api-js";
import { LEDGER, UNITS_PER_CENT, USDC } from "./deal.js";
import { accountFor, provider, txUrl } from "./network.js";
import { record } from "./runlog.js";
import { open, seal, type ViewKey } from "./seal.js";

export interface PublicRequest {
  total: string;
  funded: string;
  credited: string;
  settled: boolean;
}

/** Everything the public chain knows about the deal. */
export interface PublicState {
  deal_id: string;
  owner: string;
  agent: string;
  borrower: string;
  project_id: string;
  version_key: string | null;
  enclave_key: string | null;
  root: string | null;
  seq: number;
  in_flight: string | null;
  frozen: string | null;
  held: string;
  requests: Record<string, PublicRequest>;
  parties: string[];
}

/** What an action's transaction returns. */
export interface Outcome {
  ok: boolean;
  refused?: string;
  seq?: number;
  root?: string;
  public?: Record<string, unknown>;
}

export interface Sent<T> {
  hash: string;
  url: string;
  result: T;
}

export async function view<T>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  return (await provider.callFunction({ contractId, method, args })) as T;
}

export function state(): Promise<PublicState> {
  return view<PublicState>(LEDGER, "state");
}

/** Sends one function call signed by `signerId` and decodes what it returned. */
export async function call<T>(
  signerId: string,
  contractId: string,
  methodName: string,
  args: Record<string, unknown>,
  deposit: bigint = 0n,
): Promise<Sent<T>> {
  const tx = await accountFor(signerId).callFunctionRaw({
    contractId,
    methodName,
    args,
    gas: teraToGas("300"),
    deposit,
    waitUntil: "FINAL",
  });
  const value = (tx.status as { SuccessValue?: string }).SuccessValue;
  const result = (value ? JSON.parse(Buffer.from(value, "base64").toString()) : null) as T;
  const hash = tx.transaction.hash;
  // Everything that reaches the deal goes in the run log, for the leak test.
  if (contractId === LEDGER || args.receiver_id === LEDGER) {
    record((await state()).deal_id, LEDGER, { step: methodName, signer: signerId, hash });
  }
  return { hash, url: txUrl(hash), result };
}

/** One action on the deal, signed by the party entitled to it. */
export function act(signerId: string, method: string, args: Record<string, unknown> = {}): Promise<Sent<Outcome>> {
  return call<Outcome>(signerId, LEDGER, method, args);
}

/** Seals a command's secret fields so only the enclave can read them. */
export async function sealForEnclave(secret: Record<string, unknown>): Promise<string> {
  const { enclave_key } = await state();
  if (!enclave_key) throw new Error("the contract has not published the enclave's key yet");
  return seal(JSON.stringify(secret), enclave_key);
}

/**
 * Pays `cents` of test USDC into the deal: `{kind:"cash"}` to hold cash in the
 * books, or `{kind:"pay", request_id}` for the borrower paying a request.
 * Returns the base units the contract kept.
 */
export function payIn(signerId: string, cents: bigint, purpose: Record<string, unknown>): Promise<Sent<string>> {
  const args = { receiver_id: LEDGER, amount: (cents * UNITS_PER_CENT).toString(), msg: JSON.stringify(purpose) };
  return call<string>(signerId, USDC, "ft_transfer_call", args, 1n);
}

/** Reads a party's latest envelope from the chain and opens it with that party's key. */
export async function openEnvelope<T>(accountId: string, key: ViewKey): Promise<T | null> {
  const envelope = await view<{ seq: number; sealed: string } | null>(LEDGER, "envelope", { account_id: accountId });
  return envelope ? (JSON.parse(await open(envelope.sealed, key)) as T) : null;
}
