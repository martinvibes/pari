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
        summary="Build the Daml model, run the test suite that backs every guarantee, and start the web app locally."
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

        <h2>Run the web app</h2>
        <pre>
          <code>{`cd web
npm install
npm run dev`}</code>
        </pre>
        <p>
          The app serves on <code>http://localhost:3000</code>.
        </p>
      </div>

      <div className="mt-8">
        <Callout label="Settlement asset">
          The test suite settles in a reference CIP-56 token registry vendored from Splice. On
          Canton networks Pari settles in Canton Coin or any other CIP-56 instrument through the
          same allocation interfaces. See <Link href="/docs/settlement">CIP-56 settlement</Link>.
        </Callout>
      </div>

      <DocsPager current="/docs/quickstart" />
    </article>
  );
}
