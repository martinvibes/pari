// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import { DocsHeader, DocsPager } from "@/components/DocsBlocks";

export const metadata: Metadata = { title: "Authority matrix" };

// Mirrors docs/authority-matrix.md in the repo. Each row is a Daml Script test.
const NEVER = [
  { cannot: "create a position for anyone", why: "a position is co-signed by its lender", test: "Authority: test_agent_cannot_create_a_position" },
  { cannot: "shrink, move or archive a lender's position", why: "every position choice needs the lender, or the borrower for payments", test: "Authority: test_agent_cannot_move_a_position" },
  { cannot: "move tokens on its own", why: "allocations need executor, sender and receiver", test: "Authority: test_agent_cannot_pay_out_without_the_borrower" },
  { cannot: "start a principal repayment", why: "principal moves only against a borrower-signed notice", test: "Principal: test_agent_cannot_originate_a_principal_payment" },
  { cannot: "pay any lender more than its leg", why: "each allocation must equal its leg to the cent", test: "Principal: test_settlement_cannot_pay_more_than_requested" },
  { cannot: "pay some lenders and not others", why: "all legs settle in one transaction or none do", test: "Interest: test_every_lender_is_paid_or_none_is" },
  { cannot: "favour one lender in a short payment", why: "every lender receives the same fraction", test: "Interest: test_borrower_cannot_favour_a_lender" },
  { cannot: "clear a buyer against the DQ list itself", why: "a clearance is co-signed by the borrower via its list", test: "Authority: test_agent_cannot_clear_a_buyer_itself" },
  { cannot: "edit the borrower's DQ list", why: "only the borrower controls it", test: "Authority: test_only_the_borrower_edits_the_dq_list" },
  { cannot: "put a lender over the information wall", why: "only the lender can elect private side", test: "Disclosure: test_crossing_the_wall_is_the_lenders_choice" },
];

const CHOICES = [
  { contract: "Facility", choice: "Facility_Close", controller: "agent", moves: "each lender's own funding allocation", guard: "commitments sum to the facility size, one per lender" },
  { contract: "Facility", choice: "Facility_Settle", controller: "agent", moves: "the borrower's allocations, one per lender", guard: "each equals its leg × the same fraction; all or none" },
  { contract: "Facility", choice: "Facility_RecordAssignment", controller: "agent", moves: "register entries only", guard: "consumes a borrower-signed clearance for that buyer" },
  { contract: "Facility", choice: "Facility_AppointAuditor", controller: "borrower", moves: "nothing", guard: "the auditor is not the agent, the borrower or a lender" },
  { contract: "Facility", choice: "Facility_RemoveAuditor", controller: "borrower", moves: "nothing", guard: "an auditor is appointed" },
  { contract: "Position", choice: "Position_Settle", controller: "agent and borrower", moves: "the borrower's allocation to this lender", guard: "principal matches the register; leg pays this lender" },
  { contract: "Position", choice: "Position_Reduce", controller: "lender and agent", moves: "the lender's own principal", guard: "amount held" },
  { contract: "Position", choice: "Position_Increase", controller: "lender and agent", moves: "the lender's own principal", guard: "amount positive" },
  { contract: "Commitment", choice: "Commitment_Fund", controller: "agent", moves: "the lender's own funding allocation", guard: "allocation equals the commitment" },
  { contract: "TradeTicket", choice: "TradeTicket_Settle", controller: "agent", moves: "the buyer's cash allocation to the seller", guard: "allocation equals the price" },
  { contract: "SellDown", choice: "SellDown_Apply", controller: "agent", moves: "seller's principal, by the traded amount", guard: "issued only by a settled ticket" },
  { contract: "BuyIn", choice: "BuyIn_Apply", controller: "agent", moves: "buyer's principal, by the traded amount", guard: "issued only by a settled ticket" },
];

export default function AuthorityPage() {
  return (
    <article>
      <DocsHeader
        kicker="Reference"
        title="Authority matrix"
        summary="What the agent can never do, and every choice that can move value, with who controls it and what guards it. Each limit is enforced by the ledger and covered by a test."
      />

      <div className="docs-prose mt-8">
        <h2>What the agent can never do</h2>
        <div className="docs-table-scroll">
          <table>
            <thead>
              <tr>
                <th>The agent cannot…</th>
                <th>Why</th>
                <th>Test</th>
              </tr>
            </thead>
            <tbody>
              {NEVER.map((row) => (
                <tr key={row.test}>
                  <td>{row.cannot}</td>
                  <td>{row.why}</td>
                  <td>
                    <code>{row.test}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          A lender cannot inflate its own position either (
          <code>Authority: test_lender_cannot_inflate_its_position</code>).
        </p>

        <h2>Choices that move value</h2>
        <p>
          Value only ever moves by executing a CIP-56 allocation that the paying party created from
          its own holdings, or by changing principal on a position its lender co-signs.
        </p>
        <div className="docs-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Contract</th>
                <th>Choice</th>
                <th>Controller</th>
                <th>Can move</th>
                <th>Guard</th>
              </tr>
            </thead>
            <tbody>
              {CHOICES.map((row) => (
                <tr key={row.choice}>
                  <td>
                    <code>{row.contract}</code>
                  </td>
                  <td>
                    <code>{row.choice}</code>
                  </td>
                  <td>{row.controller}</td>
                  <td>{row.moves}</td>
                  <td>{row.guard}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          The full table, including every choice that moves nothing, is in{" "}
          <a href="https://github.com/martinvibes/pari/blob/main/docs/authority-matrix.md">
            docs/authority-matrix.md
          </a>
          .
        </p>
      </div>

      <DocsPager current="/docs/authority" />
    </article>
  );
}
