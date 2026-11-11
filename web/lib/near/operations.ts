// SPDX-License-Identifier: Apache-2.0

import "server-only";
import { teraToGas } from "near-api-js";
import { noteTransaction } from "@/lib/near/activity";
import { agentIsDao, proposalPrefix, publicRecord, publicState, type PublicState } from "@/lib/near/books";
import { read, send } from "@/lib/near/chain";
import { accountOf, NEAR, OPERATORS, UNITS_PER_CENT } from "@/lib/near/config";
import { seal } from "@/lib/near/seal";

// The deal's writes. Each is one transaction signed by the persona entitled to
// it. The contract checks the caller's role, runs the enclave and returns what
// the chain learned: the public outcome, or the enclave's reason for refusing.

/** What the chain says about an action once the enclave has answered. */
export type Outcome = { ok: boolean; refused?: string; seq?: number; root?: string; public?: Record<string, unknown> };

export type Done = { hash: string; public: Record<string, unknown> };

/** The enclave or the contract refused the action. Nothing changed. */
export class Refused extends Error {
  constructor(
    reason: string,
    readonly hash: string,
  ) {
    super(reason);
  }
}

/** Remembers which transaction wrote the newest line of the public record. */
async function note(hash: string): Promise<void> {
  const { deal_id, history_len } = await publicState();
  noteTransaction(deal_id, history_len - 1, hash);
}

async function act(personaId: string, method: string, args: Record<string, unknown> = {}): Promise<Done> {
  const { hash, result } = await send<Outcome>(personaId, NEAR.ledger, method, args);
  await note(hash);
  if (!result?.ok) throw new Refused(result?.refused ?? "the enclave did not answer", hash);
  return { hash, public: result.public ?? {} };
}

/** Seals a command's secret fields to the enclave's key, so the transaction
 *  carries only ciphertext. The box also names the deal, the persona's account
 *  and the command: anyone can copy it from the chain, and the enclave refuses
 *  it from anyone else. */
async function sealed(personaId: string, cmd: string, secret: Record<string, unknown>): Promise<string> {
  const { enclave_key, deal_id } = await publicState();
  if (!enclave_key) throw new Error("The contract has not published the enclave's key yet.");
  return seal(JSON.stringify({ ...secret, deal: deal_id, caller: accountOf(personaId), cmd }), enclave_key);
}

/** Moves test USDC from the persona's own account into the deal. */
async function payIn(personaId: string, amount: bigint, purpose: Record<string, unknown>): Promise<Done> {
  const args = { receiver_id: NEAR.ledger, amount: (amount * UNITS_PER_CENT).toString(), msg: JSON.stringify(purpose) };
  const { hash, result } = await send<string>(personaId, NEAR.usdc, "ft_transfer_call", args, 1n);
  await note(hash);
  if (BigInt(result ?? "0") === 0n) {
    // The token took everything back. The contract's record says why.
    const last = (await publicRecord()).at(-1);
    throw new Refused(last && !last.ok ? last.detail : "the deal did not take the payment", hash);
  }
  const last = (await publicRecord()).at(-1);
  return { hash, public: last?.ok ? (JSON.parse(last.detail) as Record<string, unknown>) : {} };
}

// Agent -------------------------------------------------------------------------

/** One of the agent's actions once it has run: what was asked, and what the chain made public. */
export type Ran = Done & { method: string; args: Record<string, unknown> };

/** One of the agent's actions waiting in its DAO. Nothing has run. */
export type Proposed = { hash: string; proposal: number };

/** A transaction carries 300 TGas at most. The DAO keeps some for the vote and
 *  passes this much on to the ledger, for the enclave call and its callback. */
const PROPOSAL_GAS = teraToGas("250").toString();

/** One of the agent's actions. One account signs it. When the deal's agent is
 *  a DAO, the first operator proposes it and approves it, and it waits there
 *  for a second operator. */
async function actAsAgent(method: string, args: Record<string, unknown>): Promise<Ran | Proposed> {
  const chain = await publicState();
  if (agentIsDao(chain)) return propose(chain, method, args);
  return { ...(await act("agent", method, args)), method, args };
}

async function propose(chain: PublicState, method: string, args: Record<string, unknown>): Promise<Proposed> {
  const call = { method_name: method, args: Buffer.from(JSON.stringify(args)).toString("base64"), deposit: "0", gas: PROPOSAL_GAS };
  const proposal = {
    description: `${proposalPrefix(chain.deal_id)} ${method}`,
    kind: { FunctionCall: { receiver_id: NEAR.ledger, actions: [call] } },
  };
  // The DAO holds a bond for each proposal and returns it when the proposal passes.
  const { proposal_bond } = await read<{ proposal_bond: string }>(chain.agent, "get_policy");
  const { result: id } = await send<number>(OPERATORS[0]!, chain.agent, "add_proposal", { proposal }, BigInt(proposal_bond));
  const { hash } = await approve(OPERATORS[0]!, id);
  return { hash, proposal: id };
}

type ProposedCall = { FunctionCall: { actions: Array<{ method_name: string; args: string }> } };

/** One operator approves a proposal. The second approval makes the DAO call
 *  the ledger in the same transaction, and the ledger's answer comes back. */
export async function approve(operatorId: string, id: number): Promise<Ran | Proposed> {
  const { agent: dao } = await publicState();
  const { kind } = await read<{ kind: ProposedCall }>(dao, "get_proposal", { id });
  const { method_name: method, args } = kind.FunctionCall.actions[0]!;
  const { hash, returned } = await send(operatorId, dao, "act_proposal", { id, action: "VoteApprove", proposal: kind });
  const answer = returned
    .filter(({ by }) => by === NEAR.ledger)
    .map(({ value }) => value as Outcome | null)
    .filter((value) => typeof value?.ok === "boolean")
    .at(-1);
  if (!answer) {
    const { status } = await read<{ status: string }>(dao, "get_proposal", { id });
    if (status !== "InProgress") throw new Error(`The DAO's call to ${method} did not run on the ledger: proposal ${id} is ${status}.`);
    return { hash, proposal: id };
  }
  await note(hash);
  if (!answer.ok) throw new Refused(answer.refused ?? "the enclave did not answer", hash);
  return { hash, public: answer.public ?? {}, method, args: JSON.parse(Buffer.from(args, "base64").toString()) as Record<string, unknown> };
}

export function fixRate(baseRateBps: number, periodEnd: string): Promise<Ran | Proposed> {
  return actAsAgent("fix_rate", { base_rate_bps: baseRateBps, period_end: periodEnd });
}

/** The agent types the total, as an ops desk does. The enclave computes its
 *  own from the register and refuses a total that differs. */
export function requestInterest(expectedTotal: bigint): Promise<Ran | Proposed> {
  return actAsAgent("request_interest", { expected_total: expectedTotal.toString() });
}

export function settle(requestId: number): Promise<Ran | Proposed> {
  return actAsAgent("settle", { request_id: requestId });
}

export function settleTrade(tradeId: number): Promise<Ran | Proposed> {
  return actAsAgent("settle_trade", { trade_id: tradeId });
}

// Borrower ----------------------------------------------------------------------

export function payRequest(requestId: number, amount: bigint): Promise<Done> {
  return payIn("northwind", amount, { kind: "pay", request_id: requestId });
}

export async function setDqList(accounts: string[]): Promise<Done> {
  return act("northwind", "set_dq", { sealed: await sealed("northwind", "set_dq", { list: accounts }) });
}

// Lenders and buyers --------------------------------------------------------------

export async function offerTrade(
  sellerId: string,
  offer: { buyer: string; par: bigint; pricePpm: number; tradeDate: string },
): Promise<Done> {
  const secret = { buyer: offer.buyer, par: offer.par.toString(), price_ppm: offer.pricePpm, trade_date: offer.tradeDate };
  return act(sellerId, "offer_trade", { sealed: await sealed(sellerId, "offer_trade", secret) });
}

export function acceptTrade(buyerId: string, tradeId: number): Promise<Done> {
  return act(buyerId, "accept_trade", { trade_id: tradeId });
}

export function depositCash(personaId: string, amount: bigint): Promise<Done> {
  return payIn(personaId, amount, { kind: "cash" });
}

export function withdraw(personaId: string, amount: bigint): Promise<Done> {
  return act(personaId, "withdraw", { amount: amount.toString() });
}
