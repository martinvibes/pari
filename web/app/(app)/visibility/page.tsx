// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import { LedgerUnavailable } from "@/components/app/LedgerUnavailable";
import { PageHeader, Panel, TableScroll, Tag } from "@/components/app/ui";
import { PERSONAS, type Persona } from "@/lib/pari/personas";
import { isUnavailable, viewAs, type View } from "@/lib/pari/session";
import type { Snapshot } from "@/lib/pari/snapshot";

export const metadata: Metadata = { title: "Visibility" };

type Seen = { persona: Persona; view: View };

// What each kind of contract is, in one line, and how many of them a party's
// own ledger query returns.
const ROWS: Array<{ label: string; note: string; count: (s: Snapshot) => number }> = [
  { label: "Facility and register", note: "Every lender's principal", count: (s) => s.facilities.length },
  { label: "Positions", note: "One per lender, co-signed", count: (s) => s.positions.length },
  { label: "Payment requests", note: "Legs for every lender", count: (s) => s.requests.length },
  { label: "Receipts", note: "One per lender per payment", count: (s) => s.receipts.length },
  { label: "Trade offers", note: "Seller to one buyer", count: (s) => s.offers.length },
  { label: "Trade tickets", note: "Price and cash leg", count: (s) => s.tickets.length },
  { label: "DQ list", note: "The borrower's refusals", count: (s) => s.dqLists.length },
  { label: "Screening results", note: "Buyer checked against the list", count: (s) => s.screenings.length },
  { label: "Documents", note: "Posted by the borrower", count: (s) => s.documents.length },
  { label: "Documents received", note: "One per lender per document", count: (s) => s.accesses.length },
  { label: "Cash holdings", note: "Owned, or locked to a settlement", count: (s) => s.holdings.length },
  { label: "Cash allocations", note: "Funded legs awaiting settlement", count: (s) => s.allocations.length },
];

// Privacy claims, evaluated live against the snapshots above. Each is also a
// Daml Script test in daml/pari-tests.
const CHECKS: Array<{ claim: string; test: string; holds: (seen: Seen[]) => boolean }> = [
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

export default async function VisibilityPage() {
  const views = await Promise.all(PERSONAS.map((persona) => viewAs(persona)));
  const problem = views.find(isUnavailable);
  if (problem) return <LedgerUnavailable problem={problem} />;
  const seen = PERSONAS.map((persona, i) => ({ persona, view: views[i] as View }));

  return (
    <div className="space-y-12">
      <PageHeader
        kicker="Privacy"
        title="Who sees what"
        lede="Each column is one party's own query of the ledger. The app filters nothing: Canton returns only the contracts a party is a stakeholder of, so this matrix is the privacy model, read live."
      />

      <Panel title="Contracts visible to each party" note="Counts of active contracts, refreshed on every load.">
        <TableScroll>
          <table className="table-data">
            <thead>
              <tr>
                <th>Contract</th>
                {seen.map(({ persona }) => (
                  <th key={persona.id} className="text-right">
                    {persona.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label}>
                  <td>
                    {row.label}
                    <span className="mt-0.5 block text-xs text-ash">{row.note}</span>
                  </td>
                  {seen.map(({ persona, view }) => {
                    const n = row.count(view.s);
                    return (
                      <td key={persona.id} className={`text-right text-base ${n === 0 ? "text-ash" : "text-paper"}`}>
                        {n === 0 ? "—" : n}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Panel>

      <Panel
        title="Checked live"
        note="Each claim is evaluated against the snapshots above on every load, and is also a Daml Script test."
      >
        <ul>
          {CHECKS.map((check) => {
            const holds = check.holds(seen);
            return (
              <li
                key={check.claim}
                className="flex flex-col gap-2 border-t border-white/10 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <span>
                  <span className="text-paper">{check.claim}</span>
                  <span className="mt-0.5 block font-mono text-xs text-ash">{check.test}</span>
                </span>
                {holds ? <Tag tone="paper">Holds</Tag> : <Tag tone="alert">Broken</Tag>}
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
