// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import { Callout, DocsHeader, DocsPager } from "@/components/DocsBlocks";

export const metadata: Metadata = { title: "Limits and status" };

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
            <strong>The agent and the borrower see the register.</strong> That matches syndicated
            lending practice. Lenders see only their own position.
          </li>
          <li>
            <strong>One agent party.</strong> The model treats the agent as one party. Hosting it as
            a decentralized party with a threshold across independent operators is a deployment
            concern and does not change the model.
          </li>
          <li>
            <strong>Fixed-rate periods.</strong> The agent fixes each period&rsquo;s base rate. There
            is no on-ledger rate oracle.
          </li>
        </ul>

        <h2>Status</h2>
        <table>
          <tbody>
            <tr>
              <td>Daml model and test suite</td>
              <td>Done</td>
            </tr>
            <tr>
              <td>Web app for agent, lenders, borrower and buyers</td>
              <td>In progress</td>
            </tr>
            <tr>
              <td>Deployment on the HackCanton DevNet, settling in Canton Coin</td>
              <td>In progress</td>
            </tr>
            <tr>
              <td>Agent hosted as a decentralized party across independent operators</td>
              <td>Planned</td>
            </tr>
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
