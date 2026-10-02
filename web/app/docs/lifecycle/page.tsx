// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocsHeader, DocsPager } from "@/components/DocsBlocks";

export const metadata: Metadata = { title: "Facility lifecycle" };

export default function LifecyclePage() {
  return (
    <article>
      <DocsHeader
        kicker="Concepts"
        title="Facility lifecycle"
        summary="A facility moves from syndication to closing, through interest periods and prepayments, to repayment. The worked example follows a $100m term loan."
      />

      <div className="docs-prose mt-8">
        <h2>1. Propose and accept</h2>
        <p>
          The agent proposes the terms: facility size, margin over the base rate, closing and
          maturity dates, and the CIP-56 instrument the loan is funded in. The borrower accepts,
          which creates the <code>Facility</code> in the <strong>Syndicating</strong> state.
        </p>

        <h2>2. Commit and close</h2>
        <p>
          The agent invites each lender with a <code>CommitmentOffer</code>. A lender accepts by
          signing a <code>Commitment</code> and funding a CIP-56 allocation of its amount to the
          borrower. At closing the agent executes every funding leg in one transaction. Closing
          checks that there is one commitment per lender and that they add up to the facility size
          exactly; if not, nothing moves.
        </p>
        <pre>{`Alder  50,000,000 ─┐
Birch  30,000,000 ─┼──▶ borrower receives 100,000,000 in one transaction
Cedar  20,000,000 ─┘`}</pre>

        <h2>3. Fix the rate</h2>
        <p>
          Each interest period starts where the last one was paid through. The agent fixes the base
          rate and the period end. The all-in rate is the base rate plus the margin: a 4.30% base
          with a 350 bps margin gives 7.80%.
        </p>

        <h2>4. Request and settle interest</h2>
        <p>
          The agent requests the period&rsquo;s interest. Pari computes one leg per lender from the
          register, ACT/360 on the all-in rate, rounded down to the cent, and freezes the register
          until the request settles. For a 91-day period:
        </p>
        <table>
          <thead>
            <tr>
              <th>Lender</th>
              <th>Principal</th>
              <th>Interest</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Alder</td>
              <td>50,000,000.00</td>
              <td>985,833.33</td>
            </tr>
            <tr>
              <td>Birch</td>
              <td>30,000,000.00</td>
              <td>591,500.00</td>
            </tr>
            <tr>
              <td>Cedar</td>
              <td>20,000,000.00</td>
              <td>394,333.33</td>
            </tr>
          </tbody>
        </table>
        <p>
          The borrower funds an allocation for each leg. The agent settles them all in one
          transaction. If the borrower can only pay part, every lender receives the same fraction of
          its leg and the unpaid remainder stays owed to that lender for the next period. Paying half
          of the period above leaves Alder 492,916.67 still owed.
        </p>

        <h2>5. Prepay principal</h2>
        <p>
          Only the borrower can start a principal payment, by signing a{" "}
          <code>PrepaymentNotice</code>. Between interest periods the agent turns the notice into
          pro-rata principal legs; leftover cents go to the largest holder so the legs sum to exactly
          the notice. A 25m prepayment of the facility above pays 12.5m, 7.5m and 5m.
        </p>

        <h2>6. Repay</h2>
        <p>
          When every lender&rsquo;s principal and owed interest reach zero, their positions are
          archived and the facility moves to <strong>Repaid</strong>.
        </p>
      </div>

      <div className="mt-8">
        <Callout label="Trades in between">
          Lenders can sell during an interest period. See{" "}
          <Link href="/docs/trading">Trading and screening</Link> for how the period&rsquo;s
          interest is split between seller and buyer.
        </Callout>
      </div>

      <DocsPager current="/docs/lifecycle" />
    </article>
  );
}
