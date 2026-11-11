// Calling the rules contract: public reads, actions signed by one party, and
// opening a party's envelope.

import { teraToGas } from "near-api-js";
import { DAO, LEDGER, OPERATORS, UNITS_PER_CENT, USDC } from "./deal.js";
import { accountFor, provider, txUrl } from "./network.js";
import { record, type RunEntry } from "./runlog.js";
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

function decoded<T>(value: string | undefined): T | null {
  return value ? (JSON.parse(Buffer.from(value, "base64").toString()) as T) : null;
}

/** Sends one function call signed by `signerId` and waits for all of it to finish. */
function transact(signerId: string, contractId: string, methodName: string, args: Record<string, unknown>, deposit: bigint) {
  return accountFor(signerId).callFunctionRaw({ contractId, methodName, args, gas: teraToGas("300"), deposit, waitUntil: "FINAL" });
}

/** Everything that reaches the deal goes in the run log, for the leak test. */
async function log(entry: RunEntry): Promise<void> {
  record((await state()).deal_id, LEDGER, entry);
}

/** Sends one function call signed by `signerId` and decodes what it returned. */
export async function call<T>(
  signerId: string,
  contractId: string,
  methodName: string,
  args: Record<string, unknown>,
  deposit: bigint = 0n,
): Promise<Sent<T>> {
  const tx = await transact(signerId, contractId, methodName, args, deposit);
  const hash = tx.transaction.hash;
  if (contractId === LEDGER || contractId === DAO || args.receiver_id === LEDGER) await log({ step: methodName, signer: signerId, hash });
  return { hash, url: txUrl(hash), result: decoded<T>((tx.status as { SuccessValue?: string }).SuccessValue) as T };
}

/** One action on the deal, signed by the party entitled to it. When the agent
 *  is the DAO, its action is proposed and approved by two of the operators. */
export async function act(signerId: string, method: string, args: Record<string, unknown> = {}): Promise<Sent<Outcome>> {
  if (signerId !== DAO) return call<Outcome>(signerId, LEDGER, method, args);
  const { result: id } = await propose(method, args);
  await approve(OPERATORS[0]!, id);
  const ran = await approve(OPERATORS[1]!, id);
  if (!ran.result) throw new Error(`the DAO's call to ${method} did not reach the ledger (${ran.url})`);
  return { ...ran, result: ran.result };
}

/** The first operator proposes one of the agent's actions to the DAO. Nothing
 *  runs: a proposal needs the approval of two of the three operators. */
export async function propose(method: string, args: Record<string, unknown> = {}): Promise<Sent<number>> {
  const action = { method_name: method, args: Buffer.from(JSON.stringify(args)).toString("base64"), deposit: "0", gas: teraToGas("250").toString() };
  // The DAO holds a bond for each proposal and returns it when the proposal passes.
  const [{ deal_id }, { proposal_bond }] = await Promise.all([state(), view<{ proposal_bond: string }>(DAO, "get_policy")]);
  const proposal = { description: `Pari ${deal_id}: ${method}`, kind: { FunctionCall: { receiver_id: LEDGER, actions: [action] } } };
  return call<number>(OPERATORS[0]!, DAO, "add_proposal", { proposal }, BigInt(proposal_bond));
}

/** One operator approves a proposal. The second approval makes the DAO call
 *  the ledger in the same transaction; `result` is then the ledger's answer. */
export async function approve(operator: string, id: number): Promise<Sent<Outcome | null>> {
  const { kind } = await view<{ kind: { FunctionCall: { actions: { method_name: string }[] } } }>(DAO, "get_proposal", { id });
  const tx = await transact(operator, DAO, "act_proposal", { id, action: "VoteApprove", proposal: kind }, 0n);
  const answer = tx.receipts_outcome
    .filter((receipt) => receipt.outcome.executor_id === LEDGER)
    .map((receipt) => decoded<Outcome>((receipt.outcome.status as { SuccessValue?: string }).SuccessValue))
    .filter((answer) => typeof answer?.ok === "boolean")
    .at(-1);
  const hash = tx.transaction.hash;
  const ran = answer ? { ran: kind.FunctionCall.actions[0]!.method_name } : {};
  await log({ step: "act_proposal", signer: operator, hash, ...ran });
  return { hash, url: txUrl(hash), result: answer ?? null };
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
