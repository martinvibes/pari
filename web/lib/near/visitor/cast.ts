// SPDX-License-Identifier: Apache-2.0

import "server-only";
import { teraToGas } from "near-api-js";
import { walletCents } from "@/lib/near/books";
import { fromFaucet, nearBalance } from "@/lib/near/chain";
import { NEAR, OPERATORS, UNITS_PER_CENT } from "@/lib/near/config";
import { cents } from "@/lib/near/money";
import * as ops from "@/lib/near/operations";
import { isDealView, isPartyView, isUnavailable, viewAs } from "@/lib/near/session";
import { GAS_FLOOR, GAS_GIFT, PAY_IN, SLICE } from "@/lib/near/visitor/terms";
import { addDays, addMonths, clampDate } from "@/lib/pari/dates";
import { persona } from "@/lib/pari/personas";

// A visitor's own account is one this server holds no key for: the visitor's
// browser signs what is the visitor's to sign. This is the rest of the cast
// answering it: the faucet's first funds, Alder's offer, the agent's settlement.

/** The base rate the agent fixes when a trade needs a period and none is fixed. */
const BASE_RATE_BPS = 430;

/** How many accounts one run of this server gives test NEAR to. */
const GIFT_CAP = 20;
let gifts = 0;

export type Sent = { label: string; hash: string };

/** Tops a visitor's account up to what the walk needs: test NEAR for gas and
 *  test USDC to pay in. Sends nothing to an account that has both. */
export async function fund(account: string): Promise<Sent[]> {
  const [near, wallet] = await Promise.all([nearBalance(account), walletCents(account)]);
  const sent: Sent[] = [];
  if (near < GAS_FLOOR) {
    if (gifts >= GIFT_CAP) throw new Error(`This server has given test NEAR to ${GIFT_CAP} accounts since it started, which is its limit.`);
    gifts += 1;
    sent.push({ label: "Test NEAR", hash: await fromFaucet((faucet) => faucet.transfer({ receiverId: account, amount: GAS_GIFT })) });
  }
  if (wallet < PAY_IN) {
    const args = { account_id: account, amount: ((PAY_IN - wallet) * UNITS_PER_CENT).toString() };
    const mint = { contractId: NEAR.usdc, methodName: "mint", args, gas: teraToGas("30") };
    sent.push({ label: "Test USDC", hash: await fromFaucet((faucet) => faucet.callFunctionRaw(mint)) });
  }
  return sent;
}

/** Alder offers the visitor a slice of its position, dated inside the current
 *  period or the one the agent fixes next. */
export async function offer(account: string): Promise<ops.Done> {
  const alder = await viewAs(persona("alder"));
  if (isUnavailable(alder)) throw new Error(alder.detail);
  if (!isPartyView(alder) || !alder.view.position) throw new Error("Alder holds none of the loan to sell.");
  const { view } = alder;
  const position = alder.view.position;
  if (cents(position.principal) < SLICE.par) throw new Error("Alder no longer holds enough of the loan to sell you a slice.");
  const open = view.trades.find((t) => t.buyer === account && (t.status === "offered" || t.status === "accepted"));
  if (open) throw new Error(`Alder's offer ${open.id} to you is still open.`);
  const start = view.period?.start ?? view.paid_through;
  const from = position.accrual_start > start ? position.accrual_start : start;
  const to = view.period?.end ?? view.facility.maturity;
  const tradeDate = clampDate(addDays(from, 30), from, to);
  return ops.offerTrade("alder", { buyer: account, par: SLICE.par, pricePpm: SLICE.pricePpm, tradeDate });
}

/** The agent settles the visitor's accepted trade, fixing a rate first when
 *  no period is open. Reports each transaction and whether the trade settled. */
export async function settle(account: string, tradeId: number): Promise<{ settled: boolean; sent: Sent[] }> {
  const agent = await viewAs(persona("agent"));
  if (isUnavailable(agent)) throw new Error(agent.detail);
  if (!isDealView(agent)) throw new Error("The agent's envelope is not the agent's view.");
  const { view } = agent;
  const trade = view.trades.find((t) => t.id === tradeId);
  if (!trade || trade.buyer !== account || trade.status !== "accepted") throw new Error("There is no accepted trade of yours for the agent to settle.");
  if (view.requests.some((r) => r.status === "open")) {
    throw new Error("The agent has an interest payment in progress and settles that first. Settle it on the Agent screen, then come back.");
  }
  const sent: Sent[] = [];
  if (!view.period) {
    const end = clampDate(addMonths(view.paid_through, 3), view.paid_through, view.facility.maturity);
    sent.push({ label: "Rate fixed", hash: (await asAgent(ops.fixRate(BASE_RATE_BPS, end))).hash });
  }
  const done = await asAgent(ops.settleTrade(tradeId));
  sent.push({ label: "Settlement", hash: done.hash });
  return { settled: done.public.settled === true, sent };
}

/** One of the agent's actions, once it has run. When the agent is a DAO the
 *  first operator proposed and approved it; the second operator's approval runs it. */
async function asAgent(action: Promise<ops.Ran | ops.Proposed>): Promise<ops.Ran> {
  const first = await action;
  if (!("proposal" in first)) return first;
  const second = await ops.approve(OPERATORS[1]!, first.proposal);
  if ("proposal" in second) throw new Error(`Proposal ${second.proposal} is still waiting in the agent's DAO.`);
  return second;
}
