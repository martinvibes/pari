// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import { DocsHeader, DocsPager } from "@/components/DocsBlocks";

export const metadata: Metadata = { title: "Who sees what" };

const TRADE_VIEWS = [
  { step: "Facility_RecordAssignment", who: "agent, borrower, auditor", learns: "seller, buyer, par amount, trade date, DQ clearance" },
  { step: "TradeTicket_Settle", who: "agent, seller, buyer", learns: "the price and the cash leg" },
  { step: "SellDown_Apply", who: "agent, seller", learns: "the seller's remaining position" },
  { step: "BuyIn_Apply", who: "agent, buyer", learns: "the buyer's new position" },
];

export default function PrivacyPage() {
  return (
    <article>
      <DocsHeader
        kicker="Design"
        title="Who sees what"
        summary="Canton shows each part of a transaction only to the parties involved in it. Pari arranges every workflow so that each party is involved in its own part only."
      />

      <div className="docs-prose mt-8">
        <h2>Informees</h2>
        <p>
          On Canton a transaction is a tree of actions. Each action is shown only to its{" "}
          <strong>informees</strong>: the stakeholders of the contract it acts on and the parties
          exercising it. A party that is an informee of an action also sees everything beneath it.
          Pari&rsquo;s privacy comes from choosing, for every workflow, which contract sits at the
          root and what happens beneath it.
        </p>

        <h2>Interest payment</h2>
        <p>
          The root is <code>Facility_Settle</code> on the facility, seen by the agent, the
          borrower and the borrower&rsquo;s auditor. Beneath it sits one <code>Position_Settle</code> per lender, each seen by the
          agent, the borrower and that one lender. Lender A sees its own allocation execute and its
          own receipt. It never sees the facility, the request, or any other lender&rsquo;s leg. The
          request is never fetched inside a lender&rsquo;s part of the tree, so it is never disclosed
          to a lender.
        </p>

        <h2>Trade</h2>
        <p>
          The root is <code>Desk_SettleTrade</code> on the agent&rsquo;s own desk, seen by the agent
          alone. Beneath it are four siblings:
        </p>
        <div className="docs-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Step</th>
                <th>Informees</th>
                <th>Learns</th>
              </tr>
            </thead>
            <tbody>
              {TRADE_VIEWS.map((v) => (
                <tr key={v.step}>
                  <td>
                    <code>{v.step}</code>
                  </td>
                  <td>{v.who}</td>
                  <td>{v.learns}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          So the borrower never learns the price, the buyer never learns what the seller still
          holds, the seller never learns what else the buyer holds, and other lenders see nothing.
        </p>

        <h2>The auditor</h2>
        <p>
          The borrower&rsquo;s auditor observes the facility, so it is an informee of every choice on
          it and sees each closing, payment, prepayment and assignment with everything beneath it:
          the register before and after, and each lender&rsquo;s transfer. In a trade it sees{" "}
          <code>Facility_RecordAssignment</code> and the buyer&rsquo;s clearance it uses up, never
          the ticket beside it, so never the price. The smoke test checks this against every event
          the auditor&rsquo;s node received, not only the contracts it holds.
        </p>

        <h2>DQ screening</h2>
        <p>
          <code>DqList_Screen</code> is exercised by the agent on the borrower&rsquo;s list, so its
          informees are the borrower and the agent. The buyer does not see the list or the result.
        </p>

        <h2>Information walls</h2>
        <p>
          Each lender keeps an <code>InfoElection</code>: public side or private side. A document
          reaches a lender only as a <code>DocumentAccess</code> created for that lender, and a
          document marked as material non-public information can only be shared with a lender whose
          own election is private side. Only the lender can change its election.
        </p>

        <h2>Why this needs Canton</h2>
        <p>Run the same loan on a transparent chain and each of these breaks:</p>
        <ul>
          <li>
            <strong>The register is public.</strong> Every lender&rsquo;s holding and every trade
            price is visible to competitors and counterparties.
          </li>
          <li>
            <strong>The DQ list leaks.</strong> Screening on-chain publishes who the borrower blocks.
          </li>
          <li>
            <strong>MNPI walls are impossible.</strong> Anything posted on-chain is readable by
            public-side lenders, which would put them over the wall.
          </li>
          <li>
            <strong>Per-party consent is lost.</strong> A transparent chain has no notion of a
            position co-signed by its holder, which is what keeps the agent from moving it.
          </li>
        </ul>
      </div>

      <DocsPager current="/docs/privacy" />
    </article>
  );
}
