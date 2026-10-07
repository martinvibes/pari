// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import Link from "next/link";
import { DocsHeader, DocsPager } from "@/components/DocsBlocks";

export const metadata: Metadata = { title: "Trading and screening" };

export default function TradingPage() {
  return (
    <article>
      <DocsHeader
        kicker="Design"
        title="Trading and screening"
        summary="A lender sells all or part of its position to a buyer. The position, the cash and the register move in one transaction, after the buyer is screened against the borrower's secret DQ list."
      />

      <div className="docs-prose mt-8">
        <h2>Offer and ticket</h2>
        <p>
          The seller creates a <code>TradeOffer</code> to one buyer: the par amount, the price, the
          trade date and the instrument. The buyer accepts, which creates a <code>TradeTicket</code>{" "}
          signed by both, with the cash amount fixed at par &times; price, rounded down to the cent.
          The buyer then funds a CIP-56 allocation of that cash to the seller.
        </p>

        <h2>DQ screening</h2>
        <p>
          Borrowers keep a list of disqualified lenders, typically competitors and distressed-debt
          funds they refuse to have in their capital structure. On Pari the <code>DqList</code> is
          signed by the borrower alone, and only the borrower can change it. The agent screens a
          buyer by exercising a choice on the list, which produces a <code>ScreeningResult</code>{" "}
          co-signed by the borrower. The buyer is never an informee of that check: it learns
          neither the list nor the result. A refused buyer simply cannot settle.
        </p>

        <h2>Settling the trade</h2>
        <p>
          The agent settles from its own <code>AgentDesk</code>, which composes four steps into one
          transaction:
        </p>
        <ol>
          <li>
            <strong>Record the assignment.</strong> The facility consumes the buyer&rsquo;s
            clearance and updates the register.
          </li>
          <li>
            <strong>Settle the cash.</strong> The ticket executes the buyer&rsquo;s allocation to the
            seller, after checking it equals the price.
          </li>
          <li>
            <strong>Sell down.</strong> The seller&rsquo;s position shrinks by the traded amount.
          </li>
          <li>
            <strong>Buy in.</strong> The buyer&rsquo;s position is created or grows by the traded
            amount.
          </li>
        </ol>
        <p>If any step fails, none of them happen.</p>

        <h2>Interest splits on the trade date</h2>
        <p>
          Trades settle within an interest period whose rate is fixed. On the trade date, the
          seller&rsquo;s accrual so far moves into interest owed to it, and the buyer starts
          accruing from that date. On the payment date each holder is paid exactly what it earned
          while it held the loan. A seller that sells everything keeps a zero-principal position
          until that interest is paid, and then it is archived.
        </p>
        <p>
          Example: Alder sells 10m of its 50m to Delta at 99.5 one month into a 7.80% period. Alder
          receives 9,950,000.00 at settlement, and on the payment date 853,666.66 for its full
          month on 50m and two months on 40m. Delta receives 132,166.66 for its two months on 10m.
        </p>

        <h2>Who sees the trade</h2>
        <p>
          The borrower sees who bought and how much, never the price. The buyer never sees what the
          seller still holds, and other lenders see nothing. See{" "}
          <Link href="/docs/privacy">Who sees what</Link>.
        </p>
      </div>

      <DocsPager current="/docs/trading" />
    </article>
  );
}
