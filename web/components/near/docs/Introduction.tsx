// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import { Callout, DocsHeader, DocsPager } from "@/components/DocsBlocks";
import { repoUrl } from "@/components/near/docs/shared";
import { accountUrl, NEAR } from "@/lib/near/config";
import { SITE } from "@/lib/site";

export function Introduction() {
  return (
    <article>
      <DocsHeader
        kicker="Overview"
        title="What is Pari?"
        summary="Pari keeps the administrative agent's books for a syndicated loan on NEAR. The rules run in a NEAR contract and the books inside an Intel TDX enclave. The public chain sees one total and a fingerprint, and each party sees only its own."
      />

      <div className="docs-prose mt-8">
        <p>
          A syndicated loan is one loan funded by many lenders. A bank acts as the{" "}
          <strong>administrative agent</strong>: it keeps the register of who holds how much, works
          out the interest each period, collects it from the borrower and passes each lender its
          share.
        </p>
        <ul>
          <li>
            <strong>Payments go wrong.</strong> In 2020 Citibank, as the administrative agent on
            Revlon&rsquo;s loan, meant to pay about $7.8M of interest and wired about $900M of its
            own money instead. Loan agency still runs on email, PDFs and spreadsheets.
          </li>
          <li>
            <strong>A public blockchain can&rsquo;t hold a loan&rsquo;s books either.</strong> It
            would publish every lender&rsquo;s position, every trade price and the borrower&rsquo;s
            list of banned buyers (the DQ list).
          </li>
        </ul>

        <h2>What Pari does</h2>
        <ul>
          <li>
            <strong>One step, to the cent.</strong> Every lender is paid in one step, to the cent.
            A short payment is shared pro rata, and the unpaid part is paid with the next period.
            See <Link href="/docs/settlement">Payments and the two guards</Link>.
          </li>
          <li>
            <strong>Cash against loan.</strong> A trade settles cash against loan in one step, or
            not at all. See <Link href="/docs/trading">Trading and screening</Link>.
          </li>
          <li>
            <strong>Each party sees only its own.</strong> Each party sees only what it is entitled
            to. See <Link href="/docs/privacy">Who sees what</Link>.
          </li>
          <li>
            <strong>One fact, and nothing else.</strong> A party can prove one fact from its own
            view to anyone, and show nothing else. See{" "}
            <Link href="/docs/proofs">Prove one fact</Link>.
          </li>
          <li>
            <strong>No overpayment.</strong> The agent can&rsquo;t overpay anyone, and the agent can
            be two of three operators. See{" "}
            <Link href="/docs/governance">The agent, two of three</Link>.
          </li>
        </ul>

        <h2>Two programs that check each other</h2>
        <div className="docs-table-scroll">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Where it runs</th>
                <th>What it does</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>The rules contract</strong>
                </td>
                <td>
                  <a href={accountUrl(NEAR.ledger)}>
                    <code>{NEAR.ledger}</code>
                  </a>
                  , source in <a href={repoUrl("near/contract/src")}>near/contract</a>
                </td>
                <td>
                  Checks who may do what, runs one action at a time, holds the test USDC and caps
                  every payout.
                </td>
              </tr>
              <tr>
                <td>
                  <strong>The books</strong> (<code>pari-core</code>)
                </td>
                <td>
                  An Intel TDX enclave on <a href="https://outlayer.ai">OutLayer</a>, source in{" "}
                  <a href={repoUrl("near/enclave/src")}>near/enclave</a>
                </td>
                <td>
                  Keeps positions, cash, trade prices and the DQ list in encrypted storage, and
                  applies the deal&rsquo;s rules.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          After every action the enclave hands back a <strong>fingerprint</strong> of the new books
          and, for each party, one <strong>sealed envelope</strong>, encrypted so only that party
          can open it, and one <strong>commitment</strong>: a salted hash of the facts inside that
          envelope. The contract stores all three. The public chain sees rules, totals,
          fingerprints and hashes. Each party opens its own envelope and sees its own slice.
        </p>

        <h2>How the pieces fit</h2>
        <pre>{`  a party ──signs a NEAR tx──▶ the rules contract (${NEAR.ledger})
                                 │  who may do what, one action at a time
                                 │  caps every payout
                                 ▼
                               the books (Intel TDX enclave on OutLayer)
                                 │  positions, cash, trade prices, the DQ list
                                 │  applies the deal's rules, or refuses
                                 ▼
  the public chain keeps ◀──── a fingerprint, the public totals, and
                               one sealed envelope and one commitment per party

  each party ──its own key──▶ opens its own envelope, and sees its own slice`}</pre>
        <p>
          <Link href="/docs/lifecycle">How an action runs</Link> follows one action through all nine
          steps. To see it for yourself, start with{" "}
          <Link href="/docs/quickstart">Check it yourself</Link>: two of its commands need no
          account and no keys.
        </p>

        <h2>Status</h2>
      </div>

      <div className="mt-5 space-y-4">
        <Callout label="Hackathon build · unaudited" signal>
          Pari on NEAR was built for NEAR HACKATHON, in the privacy and realworld tracks. Everything
          here runs on NEAR testnet, and 54 tests pass. It has <strong>not</strong> been audited.
          See <Link href="/docs/security">Limits and status</Link>.
        </Callout>
        <Callout label="The earlier Canton build">
          Pari was first designed for Canton at HackCanton Season 3. That build is tagged{" "}
          <a href={`${SITE.repo}/tree/pre-hackathon`}>
            <code>pre-hackathon</code>
          </a>{" "}
          and described in <a href={repoUrl("docs/canton.md")}>docs/canton.md</a>. The NEAR version
          reuses its idea, its demo deal, its test names and numbers, and the web app&rsquo;s visual
          layer.
        </Callout>
      </div>

      <DocsPager current="/docs" />
    </article>
  );
}
