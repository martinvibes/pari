// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import Link from "next/link";
import { DocsHeader, DocsPager } from "@/components/DocsBlocks";

export const metadata: Metadata = { title: "Parties and roles" };

export default function RolesPage() {
  return (
    <article>
      <DocsHeader
        kicker="Concepts"
        title="Parties and roles"
        summary="Six kinds of party take part in a Pari facility. Each one signs for what it owns and sees only what it is party to."
      />

      <div className="docs-prose mt-8">
        <table>
          <thead>
            <tr>
              <th>Party</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Agent</td>
              <td>
                Administers the facility: keeps the register, fixes rates, requests and settles
                payments, settles trades, distributes documents. Holds no money.
              </td>
            </tr>
            <tr>
              <td>Borrower</td>
              <td>Signs the facility, pays interest and principal, keeps the DQ list, posts documents.</td>
            </tr>
            <tr>
              <td>Lenders</td>
              <td>Each holds a private position co-signed with the agent.</td>
            </tr>
            <tr>
              <td>Buyers</td>
              <td>Funds buying into the loan from an existing lender.</td>
            </tr>
            <tr>
              <td>Auditor</td>
              <td>
                The borrower&rsquo;s auditor, appointed by the borrower. Follows the facility, acts on
                nothing, holds no money.
              </td>
            </tr>
            <tr>
              <td>Registry</td>
              <td>The admin of the CIP-56 instrument the loan is funded and repaid in.</td>
            </tr>
          </tbody>
        </table>

        <h2>The agent administers, it does not hold</h2>
        <p>
          In a conventional deal the agent receives the borrower&rsquo;s payment into its own
          account and then wires each lender its share. That is where Revlon went wrong. On Pari the
          agent never takes custody: the borrower funds one CIP-56 allocation per lender, and a
          payment settles only when the agent, the borrower and each lender&rsquo;s position act
          together in one transaction.
        </p>
        <p>
          The agent cannot create, shrink or move a lender&rsquo;s position, start a principal
          repayment, or clear a buyer against the DQ list on its own. The{" "}
          <Link href="/docs/authority">authority matrix</Link> lists every choice and its guard.
        </p>

        <h2>The facility belongs to agent and borrower</h2>
        <p>
          The <code>Facility</code> contract carries the terms and the register, and is signed by
          the agent and the borrower. Lenders are not stakeholders of it, which is why no lender can
          see another lender&rsquo;s holding. This matches syndicated lending practice: the agent
          keeps the register, and the borrower may inspect it.
        </p>

        <h2>The auditor follows, it does not act</h2>
        <p>
          Credit agreements let each party disclose the deal to its own auditors. The borrower
          appoints its auditor with <code>Facility_AppointAuditor</code>, which makes the auditor an
          observer of the facility. From then on it sees the register and every closing, payment,
          prepayment and assignment as the facility records it, and the{" "}
          <Link href="/auditor">auditor screen</Link> rebuilds and re-checks each one from the
          ledger&rsquo;s own history. It controls no choice. It never sees a trade&rsquo;s price, the
          DQ list or the data room, and once the borrower removes it, it sees nothing new.
        </p>

        <h2>A position belongs to its lender</h2>
        <p>
          A <code>Position</code> is signed by the agent and the lender. It can only change through
          a payment the borrower funds, or a trade the lender signs. Each settlement leaves a{" "}
          <code>Receipt</code> for that lender alone.
        </p>
      </div>

      <DocsPager current="/docs/roles" />
    </article>
  );
}
