// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocsHeader, DocsPager } from "@/components/DocsBlocks";

export const metadata: Metadata = { title: "Quickstart" };

export default function QuickstartPage() {
  return (
    <article>
      <DocsHeader
        kicker="Overview"
        title="Quickstart"
        summary="Run the test suite that backs every guarantee, then start a local Canton ledger and walk a whole deal in the app."
      />

      <div className="docs-prose mt-8">
        <h2>Prerequisites</h2>
        <ul>
          <li>
            <strong>dpm</strong> with Daml SDK 3.5.12, the Digital Asset package manager.
          </li>
          <li>
            <strong>Java 17 or later</strong> on your <code>PATH</code>, for the Daml Script test
            runner.
          </li>
          <li>
            <strong>Node.js 20</strong> for the web app.
          </li>
        </ul>

        <h2>Run the tests</h2>
        <pre>
          <code>{`git clone https://github.com/martinvibes/pari
cd pari
make test`}</code>
        </pre>
        <p>
          <code>make test</code> builds both Daml packages and runs every script in{" "}
          <code>daml/pari-tests</code>. Each guarantee in the README maps to a named test there, and
          the <Link href="/docs/authority">authority matrix</Link> lists which test covers which
          limit on the agent.
        </p>

        <h2>Run the demo</h2>
        <p>The app reads a live Canton ledger. Start a local sandbox in one terminal:</p>
        <pre>
          <code>{`make sandbox`}</code>
        </pre>
        <p>Once it reports ready, seed the demo deal and start the web app in another:</p>
        <pre>
          <code>{`make seed
cd web
npm install
npm run dev`}</code>
        </pre>
        <p>
          <code>make seed</code> allocates the cast (agent, Northwind as borrower, lenders Alder,
          Birch and Cedar, buyers Delta and Rival), closes a 100m facility from all three lenders in
          one transaction, fixes the first period at 4.30% plus 350 bp, and posts two documents. It
          writes the party ids to <code>web/.pari/cast.json</code>, which the app reads. The app
          serves on <code>http://localhost:3000</code>; open <Link href="/agent">/agent</Link>.
        </p>

        <h2>Walk the deal</h2>
        <ol>
          <li>
            <strong>Trade.</strong> As Alder, offer 10m to Delta at 99.50. As Delta, accept and fund.
            As the agent, screen Delta and settle: cash, register and both positions move in one
            transaction.
          </li>
          <li>
            <strong>Refuse a buyer.</strong> As Cedar, offer to Rival, who is on the borrower&rsquo;s
            DQ list. Rival accepts and funds, the screening comes back disqualified, and the ledger
            refuses to settle. Decline the trade as the agent; nothing moves, and Rival withdraws its
            own cash from its screen.
          </li>
          <li>
            <strong>Pay interest.</strong> As the agent, request interest. As Northwind, fund every
            leg, at 100% or less. As the agent, settle: every lender is paid in one transaction, and
            Alder&rsquo;s interest splits on the trade date.
          </li>
          <li>
            <strong>Hold the wall.</strong> As the agent, share the MNPI accounts with a public-side
            lender and the ledger refuses; share them with Alder, on the private side, and it goes
            through.
          </li>
          <li>
            <strong>Check privacy.</strong> <Link href="/visibility">/visibility</Link> runs every
            party&rsquo;s own ledger query side by side and evaluates the privacy claims live.
          </li>
        </ol>
        <p>
          To start over, run <code>make seed</code> again: it allocates fresh parties and a fresh deal
          on the same ledger, and the app switches to them.
        </p>

        <h2>Check it end to end</h2>
        <pre>
          <code>{`make smoke`}</code>
        </pre>
        <p>
          With the sandbox up, <code>make smoke</code> seeds a deal of its own and drives it through
          every write the app offers, each as the party entitled to it: trades, a refused and declined
          trade, a cancelled request, a short payment, a prepayment and the next period, the
          information wall and the DQ list. It checks the ledger&rsquo;s figures against the Daml
          tests, that no money is created or lost, and every privacy claim against each party&rsquo;s
          own view.
        </p>
      </div>

      <div className="mt-8 space-y-4">
        <Callout label="Demo mode">
          The demo server signs as every party so one browser can play the whole deal. Each screen
          still reads the ledger as its own party, and every action is submitted as the one party
          entitled to it, so the ledger enforces the same authority it would with each party on its
          own node.
        </Callout>
        <Callout label="Settlement asset">
          The tests and the demo, on the sandbox and on the HackCanton DevNet, settle in a
          reference CIP-56 test token vendored from Splice. Pari uses only the standard CIP-56
          allocation interfaces, so it is not tied to that token; settlement in Canton Coin or a
          stablecoin is planned. See{" "}
          <Link href="/docs/settlement">CIP-56 settlement</Link>.
        </Callout>
      </div>

      <DocsPager current="/docs/quickstart" />
    </article>
  );
}
