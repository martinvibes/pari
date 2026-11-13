// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import { Callout, DocsHeader, DocsPager } from "@/components/DocsBlocks";
import { repoUrl, Tx } from "@/components/near/docs/shared";
import { Tag } from "@/components/Tag";
import { accountUrl } from "@/lib/near/config";
import { SITE } from "@/lib/site";

// Mirrors the status table in docs/hackathon/PROGRESS.md.
const STATUS = [
  { item: "The deal's rules and the enclave's protocol: 28 tests", done: true },
  { item: "The rules contract, deployed on NEAR testnet: 26 tests", done: true },
  { item: "The web app in NEAR mode, played in a real browser against testnet", done: true },
  { item: "The leak test, passing on both recorded runs", done: true },
  { item: "A trade with DQ screening", done: true },
  { item: "The agent as two of three operators, on a Sputnik DAO", done: true },
  { item: "A short payment, and the period that pays the rest", done: true },
  { item: "Late answers: an answer that misses NEAR's two-minute wait changes nothing", done: true },
  { item: "Proofs: one fact, and nothing else", done: true },
  { item: "Withdrawals through NEAR's confidential intents", done: false },
];

// The recorded run of deal northwind-14, as the README lists it.
const RUN = [
  { step: "The deal is loaded, every opening position sealed", tx: "DXbQjGs4qfPVSQZC89PHqJgFinAXHsNVYVPVZDHtEeP5" },
  { step: "The agent types 900,000,000.00: refused", tx: "o36Pf9jk2zAAGQ8sf8xLa4Edo7DHGAA2qgGT3Bb5P58" },
  { step: "The agent requests 1,971,666.66", tx: "3AVZW7vFPf791Ro9vmaD1xdzv19wHQ2eEmjsJaXDg1ge" },
  { step: "The borrower pays, in one transfer", tx: "MZM57dBEUMQ8NwzSzQ9HGCyahkDNXSzuAF6yyPARgU6" },
  { step: "One settlement pays three lenders", tx: "Dndv3ZvqtTQh8JktXri4mieVPf8fyq59woE9aguFzQ4U" },
  { step: "Alder withdraws 500,000.00 of its payment", tx: "DBeuzbspmtNBBQJzvWd6sU7aShpeCEZmGbSXELkD6TsP" },
  { step: "The borrower sets its DQ list, sealed", tx: "FD3fH8P4kBwEFaR5rEhGHABo5f1suAvc1tQSHDir3pMz" },
  { step: "Alder's offer to Rival, sealed", tx: "AvRnAicioifGTyfBwgGFT66vn8uscVspSiLXPuXpBUnh" },
  { step: "Rival's trade is not settled", tx: "D85FiUHaum7vGh1BCVzZ9TUqrPhC7mAw4U6SaF8ApCEi" },
  { step: "Delta's trade settles, cash against loan", tx: "CM8FBYGPz3yjzo7A29zY3LpR9gbVJtVjC5gKz8rdnYKo" },
  { step: "Birch sends Alder's sealed offer as its own: refused", tx: "C2rKHgybrk4Ep3oFfyvW7gW3wSe8ENbFR1UdhXvqwqyJ" },
  { step: "The borrower pays half of the second period's interest", tx: "FkfBEtXVGRk9vPEMX81nEmMuXkSvQayGbPNUGQ7MSsVh" },
  { step: "One settlement pays four lenders half each", tx: "DzXpdJXgG1smPvSh2v8yift82bdLLhgADJPXdNSazRpm" },
  { step: "The third period's settlement pays every unpaid half", tx: "3CG5ocEEnJTbp2c8FyNKA7YLHC5uefow85y9vQgSVzSz" },
];

export function Limits() {
  return (
    <article>
      <DocsHeader
        kicker="Reference"
        title="Limits and status"
        summary="What you have to trust, what the public chain shows, what is not built, and what is finished, stated plainly."
      />

      <div className="docs-prose mt-8">
        <h2>What you have to trust</h2>
        <ul>
          <li>
            <strong>Intel TDX, and OutLayer&rsquo;s attested workers and keystore.</strong> The
            books are private only if the enclave is, and the random bytes that blind the
            fingerprint and salt the commitments come from the worker. Each run has a TDX
            attestation you can fetch by transaction hash.
          </li>
          <li>
            <strong>The one enclave build the contract pins.</strong> The contract calls one build,
            named by its sha256, and no other. A deal names its build in the public arguments of the
            transaction that starts it, and <code>state</code> on the contract returns it as{" "}
            <code>version_key</code>. Build it yourself with <code>near/build.sh</code> and compare
            (the build is not yet bit-for-bit reproducible across machines).
          </li>
          <li>
            <strong>Whoever holds the contract account&rsquo;s key.</strong> In this demo the
            contract account still has its full-access key, which setup uses to deploy. Its holder
            could replace the contract, or start a new deal pinned to another enclave build. The
            same person owns the OutLayer project. In production that key is deleted or handed to a
            DAO.
          </li>
          <li>
            <strong>The demo server.</strong> It holds a testnet key for every party, so one browser
            can play the whole deal. Each action is still signed by the one account entitled to it,
            and each screen opens only its own party&rsquo;s envelope. In production each party, and
            each operator, holds its own. The one exception is <code>/you</code>: there the
            visitor&rsquo;s browser holds the signing key and the view key, and the server plays
            only the other side.
          </li>
          <li>
            <strong>Privy, if you sign in with it.</strong> Privy&rsquo;s embedded wallet keeps your
            account&rsquo;s key and signs when you approve. The browser-key option keeps the key in
            the browser&rsquo;s own storage instead.
          </li>
        </ul>

        <h2>What the public chain shows</h2>
        <p>
          Who is in the syndicate, deposits and withdrawals with their amounts, who did what and
          when, one total per interest request, and envelope sizes. It does not show positions,
          per-lender payments, trade sizes and prices, the DQ list, or why a trade failed.{" "}
          <Link href="/docs/privacy">Who sees what</Link> has the whole list, including what a
          careful reader could infer.
        </p>

        <h2>Not built</h2>
        <ul>
          <li>
            Prepayments, inside-information documents and a hundred-lender scale test exist in{" "}
            <a href={`${SITE.repo}/tree/pre-hackathon`}>the Canton build</a> and were left out of this one.
          </li>
          <li>
            A production deal would have the agent admit an account before it can call; that is not
            built. An account outside the deal can slow the deal down.
          </li>
          <li>Envelopes are not padded to one length.</li>
          <li>
            Withdrawal amounts are public. Next on NEAR: withdrawals through NEAR&rsquo;s
            confidential intents, so that even those amounts are hidden.
          </li>
        </ul>

        <h2>Status</h2>
        <table>
          <tbody>
            {STATUS.map((row) => (
              <tr key={row.item}>
                <td>{row.item}</td>
                <td className="text-right">
                  <Tag tone={row.done ? "ok" : "neutral"}>{row.done ? "Done" : "Next"}</Tag>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>On testnet</h2>
        <div className="docs-table-scroll">
          <table>
            <tbody>
              <tr>
                <td>Rules contract</td>
                <td>
                  <a href={accountUrl("ledger.paridesk.testnet")}>
                    <code>ledger.paridesk.testnet</code>
                  </a>
                </td>
              </tr>
              <tr>
                <td>Test USDC (NEP-141, 6 decimals, no value)</td>
                <td>
                  <a href={accountUrl("usdc.paridesk.testnet")}>
                    <code>usdc.paridesk.testnet</code>
                  </a>
                </td>
              </tr>
              <tr>
                <td>Enclave program</td>
                <td>
                  OutLayer project <code>paridesk.testnet/pari-core</code> on{" "}
                  <a href={accountUrl("outlayer.testnet")}>
                    <code>outlayer.testnet</code>
                  </a>
                </td>
              </tr>
              <tr>
                <td>The parties</td>
                <td>
                  <code>agent</code>, <code>northwind</code> (borrower), <code>alder</code>,{" "}
                  <code>birch</code>, <code>cedar</code> (lenders), <code>delta</code>,{" "}
                  <code>rival</code> (buyers), <code>auditor</code>, each{" "}
                  <code>.paridesk.testnet</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          There are two recorded runs, both played by <code>npm run e2e</code> on the final builds,
          on 11 and 12 November 2026. <code>northwind-14</code> was played with one agent key, and{" "}
          <code>northwind-13</code> with a DAO as the agent; its transactions are under{" "}
          <Link href="/docs/governance">The agent, two of three</Link>. A new deal replaces the live
          one on the contract; a run&rsquo;s transactions stay on the chain, so the leak test and
          the proof check go on passing on both runs.
        </p>
        <div className="docs-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Step of deal northwind-14</th>
                <th>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {RUN.map((row) => (
                <tr key={row.tx}>
                  <td>{row.step}</td>
                  <td>
                    <Tx hash={row.tx} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          All 36 transactions of that run are in{" "}
          <a href={repoUrl("near/runs/northwind-14.json")}>near/runs/northwind-14.json</a>.
        </p>

        <h2>Where this build came from</h2>
        <p>
          Everything under <a href={repoUrl("near")}>near/</a>, the app&rsquo;s NEAR data layer and
          screens and the <code>/you</code> page were built during NEAR HACKATHON. Pari was first
          designed for Canton at HackCanton Season 3. That build is tagged{" "}
          <a href={`${SITE.repo}/tree/pre-hackathon`}>
            <code>pre-hackathon</code>
          </a>{" "}
          (the build as of 7 October 2026), and the full diff from it is{" "}
          <a href={`${SITE.repo}/compare/pre-hackathon...main`}>
            <code>pre-hackathon...main</code>
          </a>
          . The NEAR version reuses its idea, its demo deal, its test names and numbers, and the web
          app&rsquo;s visual layer.
        </p>
        <p>
          The code was written with Claude Code (Anthropic) as a coding agent, directed and reviewed
          by the builder. The web app&rsquo;s visual layer is derived from{" "}
          <a href="https://github.com/guha-rahul/sidereal-hedera">sidereal-hedera</a> (Apache-2.0).
        </p>
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
