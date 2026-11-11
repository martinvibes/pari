// SPDX-License-Identifier: Apache-2.0

import "server-only";
import { noteTransaction } from "@/lib/near/activity";
import { publicRecord, publicState } from "@/lib/near/books";
import { send } from "@/lib/near/chain";
import { NEAR, UNITS_PER_CENT } from "@/lib/near/config";
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

/** Seals a command's secret fields to the enclave's key, so the transaction carries only ciphertext. */
async function sealed(secret: Record<string, unknown>): Promise<string> {
  const { enclave_key } = await publicState();
  if (!enclave_key) throw new Error("The contract has not published the enclave's key yet.");
  return seal(JSON.stringify(secret), enclave_key);
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

export function fixRate(baseRateBps: number, periodEnd: string): Promise<Done> {
  return act("agent", "fix_rate", { base_rate_bps: baseRateBps, period_end: periodEnd });
}

/** The agent types the total, as an ops desk does. The enclave computes its
 *  own from the register and refuses a total that differs. */
export function requestInterest(expectedTotal: bigint): Promise<Done> {
  return act("agent", "request_interest", { expected_total: expectedTotal.toString() });
}

export function settle(requestId: number): Promise<Done> {
  return act("agent", "settle", { request_id: requestId });
}

export function settleTrade(tradeId: number): Promise<Done> {
  return act("agent", "settle_trade", { trade_id: tradeId });
}

// Borrower ----------------------------------------------------------------------

export function payRequest(requestId: number, amount: bigint): Promise<Done> {
  return payIn("northwind", amount, { kind: "pay", request_id: requestId });
}

export async function setDqList(accounts: string[]): Promise<Done> {
  return act("northwind", "set_dq", { sealed: await sealed({ list: accounts }) });
}

// Lenders and buyers --------------------------------------------------------------

export async function offerTrade(
  sellerId: string,
  offer: { buyer: string; par: bigint; pricePpm: number; tradeDate: string },
): Promise<Done> {
  const secret = { buyer: offer.buyer, par: offer.par.toString(), price_ppm: offer.pricePpm, trade_date: offer.tradeDate };
  return act(sellerId, "offer_trade", { sealed: await sealed(secret) });
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
