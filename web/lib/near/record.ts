// SPDX-License-Identifier: Apache-2.0

import type { PublicRecord } from "@/lib/near/books";
import { cents, showCents, showRate } from "@/lib/near/money";
import { formatDate } from "@/lib/pari/dates";

// The contract's public record in words: what each line is, and what it told
// anyone who reads the chain.

const ACTIONS: Record<string, string> = {
  enclave_key: "Enclave key published",
  init_deal: "Deal loaded, sealed",
  register_view_key: "View key registered",
  fix_rate: "Rate fixed",
  request_interest: "Interest requested",
  deposit: "Paid in",
  settle: "Payment settled",
  set_dq: "DQ list set, sealed",
  offer_trade: "Trade offered, sealed",
  accept_trade: "Trade accepted",
  settle_trade: "Trade settlement",
  withdraw: "Withdrawal",
};

/** A line's action, by name. */
export function actionOf(line: PublicRecord): string {
  return ACTIONS[line.action] ?? line.action;
}

/** What a line of the record tells the public, in words. A refusal's reason is public. */
export function told(line: PublicRecord): string {
  if (!line.ok) return line.detail;
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(line.detail) as Record<string, unknown>;
  } catch {
    return line.detail;
  }
  const money = (key: string) => showCents(String(d[key] ?? "0"));
  switch (line.action) {
    case "fix_rate":
      return `All-in ${showRate(Number(d.rate_bps))} to ${formatDate(String(d.period_end))}`;
    case "request_interest":
      return `Request ${d.request_id}: one total, ${money("total")}`;
    case "deposit":
      return cents(String(d.funded ?? "0")) > 0n ? `${money("funded")} towards a request` : `${money("cash")} as cash`;
    case "settle":
      return `Request ${d.request_id}: ${money("credited")} credited to the lenders, as one figure`;
    case "withdraw":
      return `${money("amount")} paid out`;
    case "settle_trade":
      return `Trade ${d.trade_id} ${d.settled ? "settled" : "not settled"}. No size, no price, no reason`;
    case "offer_trade":
    case "accept_trade":
      return `Trade ${d.trade_id}. No size, no price`;
    case "set_dq":
      return "Ciphertext only";
    default:
      return "";
  }
}
