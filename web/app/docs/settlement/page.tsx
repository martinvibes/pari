// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import { Callout, DocsHeader, DocsPager } from "@/components/DocsBlocks";

export const metadata: Metadata = { title: "CIP-56 settlement" };

const FLOWS = [
  { flow: "Closing", request: "Commitment", legs: "lender → borrower, the commitment", by: "Facility_Close" },
  { flow: "Interest", request: "PaymentRequest", legs: "borrower → each lender, its interest", by: "Facility_Settle" },
  { flow: "Principal", request: "PaymentRequest", legs: "borrower → each lender, its pro-rata share", by: "Facility_Settle" },
  { flow: "Trade", request: "TradeTicket", legs: "buyer → seller, the price", by: "Desk_SettleTrade" },
];

export default function SettlementPage() {
  return (
    <article>
      <DocsHeader
        kicker="Design"
        title="CIP-56 settlement"
        summary="Pari never holds, mints or moves tokens itself. Every payment is a standard CIP-56 allocation created by the payer's own wallet against a Pari request."
      />

      <div className="docs-prose mt-8">
        <h2>Requests are allocation requests</h2>
        <p>
          CIP-56 is the Canton token standard. In its allocation workflow an app asks a party to
          set aside tokens for a specific settlement, the party&rsquo;s wallet creates an{" "}
          <strong>allocation</strong> from its own holdings, and the app later executes it. Every
          Pari request implements the standard <code>AllocationRequest</code> interface, so any
          CIP-56 wallet can show it and fund it.
        </p>
        <div className="docs-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Flow</th>
                <th>Request</th>
                <th>Legs</th>
                <th>Executed by</th>
              </tr>
            </thead>
            <tbody>
              {FLOWS.map((f) => (
                <tr key={f.flow}>
                  <td>{f.flow}</td>
                  <td>
                    <code>{f.request}</code>
                  </td>
                  <td>{f.legs}</td>
                  <td>
                    <code>{f.by}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>The Revlon guard</h2>
        <p>
          Before executing an allocation, Pari fetches it and checks that its specification equals
          the expected leg exactly: the same settlement reference, the same leg id, the same sender,
          receiver, amount and instrument. An allocation that would pay a lender one cent more than
          its leg is rejected, and because every leg settles in one transaction, so is the whole
          payment.
        </p>

        <h2>Three keys to move money</h2>
        <p>
          A CIP-56 allocation can only be executed with the authority of its executor, sender and
          receiver together. For an interest payment that is the agent, the borrower and the lender.
          Pari gathers the three inside one transaction: the borrower&rsquo;s authority comes from
          the facility it signed, and each lender&rsquo;s from its own position. The agent alone
          holds one key of three.
        </p>

        <h2>Deadlines</h2>
        <p>
          Every request carries an allocate-before and a settle-before time. If the agent does not
          settle in time, it cancels the request and the borrower withdraws its own allocations
          through the standard CIP-56 <code>Allocation_Withdraw</code>. Money that was set aside is
          never stranded with the agent.
        </p>
      </div>

      <div className="mt-8">
        <Callout label="Settlement asset">
          The test suite settles in a reference CIP-56 registry vendored from Splice 0.6.13. On
          Canton networks the same interfaces settle in Canton Coin or any other CIP-56 instrument.
        </Callout>
      </div>

      <DocsPager current="/docs/settlement" />
    </article>
  );
}
