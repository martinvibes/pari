// SPDX-License-Identifier: Apache-2.0

import type { BooksView, DealView, Envelope, PartyView, PublicRecord, PublicState } from "@/lib/near/books";
import { commitmentOf } from "@/lib/near/proofs";

// The privacy and money claims, each evaluated on every load against what the
// chain holds and what each party's key opens. Each is also a Rust test.

export type Reading = {
  chain: PublicState;
  record: PublicRecord[];
  seen: Array<{ account: string; envelope: Envelope; view: BooksView }>;
};

export type Check = { claim: string; test: string; holds: (reading: Reading) => boolean };

const isParty = (view: BooksView): view is PartyView => view.role === "party";
const isDeal = (view: BooksView): view is DealView => view.role !== "party";

function dealViews(reading: Reading, role: DealView["role"]): DealView[] {
  return reading.seen.map((s) => s.view).filter(isDeal).filter((view) => view.role === role);
}

function partyViews(reading: Reading): Array<{ account: string; view: PartyView }> {
  return reading.seen.flatMap(({ account, view }) => (isParty(view) ? [{ account, view }] : []));
}

/** True when `figure` stands in `text` as a whole number, not inside a longer one. */
function names(text: string, figure: string): boolean {
  return new RegExp(`(?<![0-9.])${figure}(?![0-9])`).test(text);
}

/** What anyone can read, less the lines the design makes public on purpose:
 *  a deposit and a withdrawal are token transfers, and show their amounts. */
function publicText({ chain, record }: Reading): string {
  const lines = record.filter((line) => line.action !== "deposit" && line.action !== "withdraw").map((line) => line.detail);
  return [JSON.stringify({ ...chain, held: null }), ...lines].join("\n");
}

/** Every private figure in the books, in cents, as the agent's envelope has them. */
function privateFigures(reading: Reading): string[] {
  const agent = dealViews(reading, "agent")[0];
  if (!agent) return [];
  const published = new Set(Object.values(reading.chain.requests).flatMap((r) => [r.total, r.funded, r.credited]));
  const figures = [
    ...Object.values(agent.register).map((entry) => entry.principal),
    ...agent.requests.filter((r) => Object.keys(r.legs).length > 1).flatMap((r) => [...Object.values(r.legs), ...Object.values(r.paid)]),
    ...agent.trades.flatMap((t) => [t.par, t.cash ?? "0", String(t.price_ppm ?? 0)]),
  ];
  // A figure the chain publishes anyway (a short payment of exactly one lender's share, say) tells nobody whose it is.
  return [...new Set(figures)].filter((figure) => BigInt(figure) >= 100n && !published.has(figure));
}

export const CHECKS: Check[] = [
  {
    claim: "The public chain names no lender's position or payment, and no trade's size or price",
    test: "enclave/tests/protocol.rs: test_secrets_never_appear_in_public_inputs_or_replies",
    holds: (reading) => {
      const text = publicText(reading);
      return privateFigures(reading).every((figure) => !names(text, figure));
    },
  },
  {
    claim: "Each lender's envelope holds its own line, and names no party it has not traded with",
    test: "enclave/tests/protocol.rs: test_each_party_opens_only_its_own_envelope",
    holds: (reading) =>
      partyViews(reading).every(({ account, view }) => {
        const text = JSON.stringify(view);
        const counterparties = new Set(view.trades.flatMap((t) => [t.seller, t.buyer]));
        const strangers = reading.seen.map((s) => s.account).filter((other) => other !== account && !counterparties.has(other));
        return !("register" in view) && !("requests" in view) && strangers.every((other) => !text.includes(other));
      }),
  },
  {
    claim: "The borrower and the auditor see every trade, and no price",
    test: "enclave/tests/trading.rs: test_trade_privacy",
    holds: (reading) =>
      [...dealViews(reading, "borrower"), ...dealViews(reading, "auditor")].every((view) =>
        view.trades.every((t) => t.price_ppm === undefined && t.cash === undefined),
      ),
  },
  {
    claim: "Only the borrower's envelope holds the DQ list",
    test: "enclave/tests/trading.rs: test_trade_privacy",
    holds: (reading) => reading.seen.every(({ view }) => ("dq_list" in view) === (view.role === "borrower")),
  },
  {
    claim: "A buyer that fails screening is told 'not settled' and no reason",
    test: "enclave/tests/trading.rs: test_dq_listed_buyer_is_refused",
    holds: (reading) =>
      reading.seen.every(({ view }) => view.role === "agent" || view.trades.every((t) => !("screening" in t))),
  },
  {
    claim: "Lenders were never credited more than the borrower paid in",
    test: "contract/src/tests.rs: test_lenders_cannot_be_credited_more_than_the_borrower_paid_in",
    holds: ({ chain }) =>
      chain.frozen === null &&
      Object.values(chain.requests).every((r) => BigInt(r.credited) <= BigInt(r.funded) && BigInt(r.funded) <= BigInt(r.total)),
  },
  {
    claim: "Every refusal is on the public record, and the books did not move",
    test: "enclave/tests/protocol.rs: test_the_wrong_total_is_refused_and_the_books_do_not_move",
    holds: ({ record }) => record.every((line, i) => line.ok || i === 0 || line.seq === record[i - 1]!.seq),
  },
  {
    claim: "Each party's commitment on the chain is the hash of the facts in its envelope, so one fact can be proved and no other shown",
    test: "enclave/tests/protocol.rs: test_a_party_proves_one_fact_and_shows_nothing_else",
    holds: ({ chain, seen }) => seen.every(({ envelope, view }) => commitmentOf(chain.deal_id, view) === envelope.commitment),
  },
];
