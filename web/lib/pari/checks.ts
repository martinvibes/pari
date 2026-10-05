// SPDX-License-Identifier: Apache-2.0

import type { Persona } from "@/lib/pari/personas";
import type { View } from "@/lib/pari/session";

/** One party's own view of the ledger, labelled with who that party is. */
export type Seen = { persona: Persona; view: View };

export type PrivacyCheck = { claim: string; test: string; holds: (seen: Seen[]) => boolean };

// Privacy claims, evaluated against every party's own snapshot: live on the
// visibility screen, and by the smoke test. Each is also a Daml Script test
// in daml/pari-tests.
export const PRIVACY_CHECKS: PrivacyCheck[] = [
  {
    claim: "Each lender sees its own position and no other",
    test: "Syndication: test_lenders_see_only_their_own_position",
    holds: (seen) =>
      lenders(seen).every(({ view }) => view.s.positions.every((p) => p.payload.lender === view.party)),
  },
  {
    claim: "Only the agent and the borrower see the register",
    test: "Syndication: test_lenders_see_only_their_own_position",
    holds: (seen) => lenders(seen).every(({ view }) => view.s.facilities.length === 0),
  },
  {
    claim: "The borrower never sees a trade price",
    test: "Trading: test_trade_privacy",
    holds: (seen) =>
      seen
        .filter(({ persona }) => persona.role === "borrower")
        .every(({ view }) => view.s.offers.length === 0 && view.s.tickets.length === 0),
  },
  {
    claim: "No lender or buyer sees the DQ list or a screening",
    test: "Trading: test_dq_listed_buyer_is_refused",
    holds: (seen) =>
      lenders(seen).every(({ view }) => view.s.dqLists.length === 0 && view.s.screenings.length === 0),
  },
  {
    claim: "A lender holds only the documents shared with it",
    test: "Disclosure: test_mnpi_reaches_private_side_only",
    holds: (seen) =>
      lenders(seen).every(
        ({ view }) =>
          view.s.documents.length === 0 && view.s.accesses.every((a) => a.payload.lender === view.party),
      ),
  },
  {
    claim: "The agent holds no money",
    test: "Authority: test_agent_never_holds_the_money",
    holds: (seen) =>
      seen
        .filter(({ persona }) => persona.role === "agent")
        .every(({ view }) => view.s.holdings.every((h) => h.payload.owner !== view.party)),
  },
];

function lenders(seen: Seen[]) {
  return seen.filter(({ persona }) => persona.role === "lender");
}
