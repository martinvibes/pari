// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocsHeader, DocsPager } from "@/components/DocsBlocks";
import { Tag } from "@/components/Tag";

export const metadata: Metadata = { title: "Limits and status" };

// Mirrors the Status table in the README.
const STATUS = [
  { item: "Daml model and test suite", done: true },
  { item: "Web app for agent, lenders, borrower and buyers, on a local Canton sandbox", done: true },
  { item: "Deployment on the HackCanton DevNet", done: true },
  { item: "The borrower's auditor, with an audit trail rebuilt and re-checked from the ledger", done: true },
  { item: "A hundred lenders per transaction, tested and timed on a Canton sandbox", done: true },
  { item: "Settlement in Canton Coin, on DevNet", done: true },
  { item: "Settlement in a USD stablecoin (e.g. USDCx)", done: false },
  { item: "Agent hosted as a decentralized party across independent operators, two of three, on LocalNet", done: true },
];

export default function SecurityPage() {
  return (
    <article>
      <DocsHeader
        kicker="Reference"
        title="Limits and status"
        summary="What Pari does not protect against, stated plainly, and what is finished."
      />

      <div className="docs-prose mt-8">
        <h2>Limits</h2>
        <ul>
          <li>
            <strong>The agent is trusted for liveness.</strong> It can decline to settle. Requests
            carry deadlines, after which payers withdraw their own allocations through the standard
            CIP-56 <code>Allocation_Withdraw</code>.
          </li>
          <li>
            <strong>The agent, the borrower and the borrower&rsquo;s auditor see the register.</strong>{" "}
            That matches syndicated lending practice. Lenders see only their own position. Recording
            a trade uses up the buyer&rsquo;s DQ clearance inside a facility choice, so the auditor
            witnesses that clearance; it never receives the price, the DQ list or a document.
          </li>
          <li>
            <strong>One agent party in the app.</strong> The web app and the deal on DevNet run the
            agent as one party. On LocalNet it runs as a decentralized party across three
            operators, two of three; see <Link href="/docs/governance">The agent, two of three</Link>.
          </li>
          <li>
            <strong>Fixed-rate periods.</strong> The agent fixes each period&rsquo;s base rate. There
            is no on-ledger rate oracle.
          </li>
        </ul>

        <h2>Status</h2>
        <table>
          <tbody>
            {STATUS.map((row) => (
              <tr key={row.item}>
                <td>{row.item}</td>
                <td className="text-right">
                  <Tag tone={row.done ? "ok" : "neutral"}>{row.done ? "Done" : "Planned"}</Tag>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8">
        <Callout label="Unaudited" signal>
          Pari has not had a third-party audit. Treat it as a hackathon demonstration, not as a
          production system.
        </Callout>
      </div>

      <DocsPager current="/docs/security" />
    </article>
  );
}
