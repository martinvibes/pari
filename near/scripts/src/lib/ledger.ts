// Calling the rules contract: public reads, actions signed by one party,
// opening a party's envelope, and checking a proof cut from one.

import { teraToGas } from "near-api-js";
import { DAO, LEDGER, OPERATORS, UNITS_PER_CENT, USDC } from "./deal.js";
import { accountFor, archive, provider, txUrl } from "./network.js";
import { commitmentOf, prove, read, type Fact, type Proof } from "./proofs.js";
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

// NEAR waits about two minutes for the enclave. When no answer comes in that
// time the contract records that nothing changed, returns any deposit, and
// frees the deal for the next action. Sending the action again is then safe:
// the enclave builds only on books the contract has shown it received, so an
// answer that arrives too late counts for nothing.
const UNANSWERED = "the enclave did not answer";
const ATTEMPTS = 4;

type Receipts = { receipts_outcome: { outcome: { executor_id: string; logs: string[] } }[] };

function unanswered(tx: Receipts): boolean {
  return tx.receipts_outcome.some(({ outcome }) => outcome.executor_id === LEDGER && outcome.logs.some((line) => line.includes(UNANSWERED)));
}

function again(what: string, hash: string): void {
  console.warn(`  (the enclave did not answer ${what} in time and nothing changed; sending it again)\n    ${txUrl(hash)}`);
}

/** Sends one function call signed by `signerId` and decodes what it returned.
 *  An action the enclave did not answer in time is sent again. */
export async function call<T>(
  signerId: string,
  contractId: string,
  methodName: string,
  args: Record<string, unknown>,
  deposit: bigint = 0n,
): Promise<Sent<T>> {
  for (let attempt = 1; ; attempt += 1) {
    const tx = await transact(signerId, contractId, methodName, args, deposit);
    const hash = tx.transaction.hash;
    if (contractId === LEDGER || contractId === DAO || args.receiver_id === LEDGER) await log({ step: methodName, signer: signerId, hash });
    if (attempt === ATTEMPTS || !unanswered(tx)) {
      return { hash, url: txUrl(hash), result: decoded<T>((tx.status as { SuccessValue?: string }).SuccessValue) as T };
    }
    again(methodName, hash);
  }
}

/** One action on the deal, signed by the party entitled to it. When the agent
 *  is the DAO, its action is proposed and approved by two of the operators,
 *  and proposed afresh if the enclave did not answer in time. */
export async function act(signerId: string, method: string, args: Record<string, unknown> = {}): Promise<Sent<Outcome>> {
  if (signerId !== DAO) return call<Outcome>(signerId, LEDGER, method, args);
  for (let attempt = 1; ; attempt += 1) {
    const { result: id } = await propose(method, args);
    await approve(OPERATORS[0]!, id);
    const ran = await approve(OPERATORS[1]!, id);
    if (!ran.result) throw new Error(`the DAO's call to ${method} did not reach the ledger (${ran.url})`);
    if (attempt === ATTEMPTS || !ran.unanswered) return { ...ran, result: ran.result };
    again(method, ran.hash);
  }
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
 *  the ledger in the same transaction; `result` is then the ledger's answer,
 *  and `unanswered` says the enclave gave none in time. */
export async function approve(operator: string, id: number): Promise<Sent<Outcome | null> & { unanswered: boolean }> {
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
  return { hash, url: txUrl(hash), result: answer ?? null, unanswered: unanswered(tx) };
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
  const envelope = await view<Envelope | null>(LEDGER, "envelope", { account_id: accountId });
  return envelope ? (JSON.parse(await open(envelope.sealed, key)) as T) : null;
}

/** What the chain holds for one party: its sealed view, and the enclave's
 *  commitment to every fact in it. */
export interface Envelope {
  seq: number;
  sealed: string;
  commitment: string;
}

/** A party's envelope as the chain holds it now, or held it at `block`. An
 *  archival node answers for a block of any age. */
async function envelopeAt(accountId: string, block?: number): Promise<{ envelope: Envelope | null; block: number }> {
  const [node, blockQuery] = block === undefined ? [provider, { finality: "final" as const }] : [archive, { blockId: block }];
  const args = { account_id: accountId };
  for (let attempt = 1; ; attempt += 1) {
    try {
      const answer = await node.callFunctionRaw({ contractId: LEDGER, method: "envelope", args, blockQuery });
      return { envelope: JSON.parse(Buffer.from(answer.result).toString()) as Envelope | null, block: answer.block_height };
    } catch (error) {
      // A block that became final a second ago may not have reached the archival node yet.
      if (attempt === 3 || (error as Error).name !== "UnknownBlockError") throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

/**
 * A party opens its latest envelope and cuts the proof of one fact from it:
 * `position`, `cash`, `payments.0`. The proof names the block it was read at,
 * so it can be checked after the deal has moved on.
 */
export async function proveFact(accountId: string, key: ViewKey, item: string): Promise<Proof> {
  const [{ deal_id }, { envelope, block }] = await Promise.all([state(), envelopeAt(accountId)]);
  if (!envelope) throw new Error(`the chain holds no envelope for ${accountId}`);
  const mine = JSON.parse(await open(envelope.sealed, key)) as Record<string, unknown>;
  if (commitmentOf(deal_id, mine) !== envelope.commitment) throw new Error(`${accountId}'s envelope does not hash to the chain's commitment`);
  return prove(mine, item, { ledger: LEDGER, deal: deal_id, block });
}

export type Verdict = { holds: true; fact: Fact; at: Date; latest: boolean } | { holds: false; why: string };

/**
 * Checks a proof the way an outsider does, with no keys: the fact and its salt
 * must hash into the proof's list, and the chain must have held that list's
 * hash as the party's commitment at the block the proof names.
 */
export async function checkProof(proof: Proof): Promise<Verdict> {
  const shown = read(proof);
  if (!shown) return { holds: false, why: "the fact, its salt and the list of hashes do not belong together" };
  if (proof.ledger !== LEDGER) return { holds: false, why: `the proof names ${proof.ledger}, and this deal's rules contract is ${LEDGER}` };
  const { fact, commitment } = shown;
  const then = await envelopeAt(fact.party, proof.block).catch(() => null);
  if (!then) return { holds: false, why: `NEAR's archive could not be asked about block ${proof.block}` };
  if (then.envelope?.commitment !== commitment) {
    return { holds: false, why: `at block ${proof.block} the chain did not hold this commitment for ${fact.party}` };
  }
  const [{ header }, now] = await Promise.all([archive.viewBlock({ blockId: proof.block }), envelopeAt(fact.party)]);
  return { holds: true, fact, at: new Date(Number(BigInt(header.timestamp_nanosec) / 1_000_000n)), latest: now.envelope?.commitment === commitment };
}
