// SPDX-License-Identifier: Apache-2.0

import type { Unavailable } from "@/lib/pari/session";
import { PageHeader, Panel } from "@/components/app/ui";

/** Shown instead of a screen when there is no ledger or no demo deal on it. */
export function LedgerUnavailable({ problem }: { problem: Unavailable }) {
  return (
    <div className="space-y-12">
      <PageHeader
        kicker="Ledger"
        title={problem.unavailable === "cast" ? "No deal yet" : "Ledger offline"}
        lede="The app reads a running Canton ledger. Start a local sandbox and seed the demo deal, then reload."
      />
      <Panel title="Start the demo ledger" note={problem.detail}>
        <pre className="panel-subtle overflow-x-auto p-5 font-mono text-sm leading-7 text-smoke">
          {`make sandbox      # terminal 1: Canton sandbox with Pari loaded
make seed         # terminal 2: closes the Northwind facility
cd web && npm run dev`}
        </pre>
      </Panel>
    </div>
  );
}
