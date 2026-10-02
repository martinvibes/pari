// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocsHeader, DocsPager } from "@/components/DocsBlocks";

export const metadata: Metadata = { title: "Introduction" };

export default function IntroductionPage() {
  return (
    <article>
      <DocsHeader
        kicker="Overview"
        title="What is Pari?"
        summary="Pari is an administrative-agent ledger for syndicated and private-credit loans on Canton. It keeps the lender register, pays every lender in one transaction, settles trades delivery-versus-payment, and keeps each party's view private."
      />

      <div className="docs-prose mt-8">
        <p>
          A syndicated loan is one loan funded by many lenders. A bank acts as the{" "}
          <strong>administrative agent</strong>: it keeps the register of who holds how much, works
          out the interest each period, collects it from the borrower and passes each lender its
          share. When a lender sells part of its loan to a new fund, the agent records the trade and
          splits the period&rsquo;s interest between seller and buyer.
        </p>
        <p>Today that work runs on email, PDFs and spreadsheets, and it shows:</p>
        <ul>
          <li>
            <strong>Payments go wrong.</strong> In 2020 Citibank, as agent, mistakenly sent
            Revlon&rsquo;s lenders about $900m of its own money instead of an interest payment.
          </li>
          <li>
            <strong>Trades settle slowly.</strong> Par loan trades routinely take more than a week to
            settle, with assignments chased by email and accrued interest split by hand.
          </li>
          <li>
            <strong>Privacy is all or nothing.</strong> Lenders must not see each other&rsquo;s
            holdings, buyers must not see the borrower&rsquo;s list of disqualified lenders, and
            public-side lenders must not receive material non-public information. A transparent
            chain breaks all three.
          </li>
        </ul>

        <h2>What Pari does</h2>
        <ul>
          <li>
            <strong>Private positions.</strong> Each lender&rsquo;s position is a contract co-signed
            by that lender and the agent. Only the agent and the borrower see the full register.
          </li>
          <li>
            <strong>Atomic payments.</strong> Interest and principal reach every lender in one
            transaction, to the cent, or reach none of them.
          </li>
          <li>
            <strong>Real settlement.</strong> Every payment is a standard CIP-56 allocation funded by
            the payer. The agent never holds the money.
          </li>
          <li>
            <strong>DvP trades.</strong> A position and its price change hands in one transaction,
            with interest split on the trade date.
          </li>
          <li>
            <strong>Secret DQ screening.</strong> Buyers are checked against the borrower&rsquo;s
            disqualified-lender list without ever seeing it.
          </li>
          <li>
            <strong>MNPI walls.</strong> Material non-public information reaches only lenders that
            elected the private side.
          </li>
        </ul>

        <h2>How the pieces fit</h2>
        <pre>{`  FacilityProposal ──accept──▶ Facility (agent, borrower)
                                  │  register: lender → principal, interest owed
                                  │
  CommitmentOffer ──accept──▶ Commitment ──close──▶ Position (agent, lender)

  Facility ──request──▶ PaymentRequest (one CIP-56 leg per lender)
  Facility ──settle───▶ every leg executes, one Receipt per lender

  TradeOffer ──accept──▶ TradeTicket ──desk──▶ register, cash and positions move together
  DqList (borrower) ──screen──▶ ScreeningResult (borrower, agent)
  Document (borrower) ──share──▶ DocumentAccess (private-side lenders only)`}</pre>
        <p>
          Start with <Link href="/docs/roles">Parties and roles</Link>, then follow a loan through
          its <Link href="/docs/lifecycle">lifecycle</Link>.
        </p>

        <h2>Status</h2>
      </div>

      <div className="mt-5">
        <Callout label="Hackathon build · unaudited" signal>
          Pari was built for HackCanton Season 3. The Daml model and its test suite are complete;
          the web app and the DevNet deployment are in progress. It has <strong>not</strong> been
          audited. See <Link href="/docs/security">Limits and status</Link>.
        </Callout>
      </div>

      <DocsPager current="/docs" />
    </article>
  );
}
