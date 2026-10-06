// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import { LedgerUnavailable } from "@/components/app/LedgerUnavailable";
import { Party } from "@/components/app/party";
import { UpdateId } from "@/components/app/UpdateId";
import { Empty, FACILITY_TONE, Facts, PageHeader, Panel, Stats, TableScroll, Tag, type Tone } from "@/components/app/ui";
import { auditTrail, type Audit, type Finding, type TrailRow } from "@/lib/pari/audit";
import { formatTime } from "@/lib/pari/dates";
import { cashUnit, outstandingCents, unitOf } from "@/lib/pari/deal";
import { formatCents, formatShare, toCents } from "@/lib/pari/money";
import { persona } from "@/lib/pari/personas";
import { isUnavailable, unavailable, viewAs, type View } from "@/lib/pari/session";
import type * as P from "@/lib/pari/types";

export const metadata: Metadata = { title: "Auditor" };

// Templates whose contracts carry a trade price, the DQ list or the data
// room. Across everything the auditor witnesses, none should appear.
const NEVER: Array<{ label: string; templates: string[] }> = [
  { label: "Trade prices (offers and tickets)", templates: ["Pari.Trade:TradeOffer", "Pari.Trade:TradeTicket"] },
  { label: "The DQ list", templates: ["Pari.Screening:DqList"] },
  { label: "The data room (documents and copies)", templates: ["Pari.Disclosure:Document", "Pari.Disclosure:DocumentAccess"] },
  { label: "Lenders' information walls", templates: ["Pari.Disclosure:InfoElection"] },
];

const FINDING_TAG: Record<Finding["state"], { tone: Tone; text: string }> = {
  ok: { tone: "ok", text: "Holds" },
  fail: { tone: "stop", text: "Broken" },
  none: { tone: "neutral", text: "None yet" },
};

export default async function AuditorPage() {
  const view = await viewAs(persona("auditor"));
  if (isUnavailable(view)) return <LedgerUnavailable problem={view} />;
  let audit: Audit;
  try {
    audit = await auditTrail(view.party, view.name);
  } catch (error) {
    return <LedgerUnavailable problem={unavailable(error)} />;
  }
  const f = audit.facility;
  const appointed = f !== null && view.s.facilities.length > 0;

  const checks = audit.rows.flatMap((r) => r.checks);
  const paid = audit.rows
    .filter((r) => r.event === "Interest paid" || r.event === "Principal repaid")
    .reduce((sum, r) => sum + (r.amount ?? 0n), 0n);
  const unit = f ? unitOf(f.terms.instrumentId) : cashUnit(view.cast);

  return (
    <div className="space-y-12">
      <PageHeader
        kicker="The borrower's auditor"
        title="Auditor"
        party="Auditor"
        lede="Appointed by Northwind, the auditor follows the facility on the ledger and acts on nothing. Its audit trail is the ledger's own history, as Canton lets the auditor see it: every line carries the id of the transaction it records, and every figure is checked again here."
      >
        {f ? (
          <Facts
            items={[
              { label: "Facility", value: f.terms.name },
              { label: "Status", value: f.status, tone: FACILITY_TONE[f.status] },
              { label: "Appointed by", value: view.name(f.borrower) },
              { label: "Access", value: appointed ? "Live" : "Removed", tone: appointed ? "ok" : "neutral" },
            ]}
          />
        ) : null}
      </PageHeader>

      {f === null ? (
        <Panel title="Not appointed">
          <Empty>The auditor sees nothing until Northwind appoints it on the borrower screen.</Empty>
        </Panel>
      ) : (
        <>
          <Stats
            items={[
              { label: `Outstanding (${unit})`, value: formatCents(outstandingCents(f)) },
              { label: `Paid to lenders (${unit})`, value: formatCents(paid) },
              { label: "Transactions witnessed", value: String(audit.transactions) },
              { label: "Checks passed", value: `${checks.filter((c) => c.ok).length} of ${checks.length}` },
            ]}
          />

          <div className="grid gap-6 lg:grid-cols-12">
            <Reconciliation audit={audit} />
            <Register view={view} facility={f} />
          </div>

          <Trail view={view} audit={audit} unit={unit} />
          <NeverReceived audit={audit} />
        </>
      )}
    </div>
  );
}

function Reconciliation({ audit }: { audit: Audit }) {
  return (
    <Panel
      title="Reconciliation"
      note="Each line re-checks the agent's books against what the auditor saw happen on the ledger."
      className="lg:col-span-5"
    >
      <ul className="divide-y divide-white/10">
        {audit.reconciliation.map((finding) => {
          const tag = FINDING_TAG[finding.state];
          return (
            <li key={finding.label} className="flex items-start justify-between gap-4 py-3.5 first:pt-0">
              <span>
                <span className="block font-medium text-paper">{finding.label}</span>
                <span className="mt-0.5 block text-[13px] text-pewter">{finding.detail}</span>
              </span>
              <Tag tone={tag.tone}>{tag.text}</Tag>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Register({ view, facility: f }: { view: View; facility: P.Facility }) {
  const total = outstandingCents(f);
  const rows = [...f.register].sort(([, a], [, b]) => Number(toCents(b.principal) - toCents(a.principal)));
  return (
    <Panel
      title="Register"
      note="The facility's register as the auditor holds it: the same contract the agent and borrower sign, not a copy."
      className="lg:col-span-7"
    >
      <TableScroll>
        <table className="table-data">
          <thead>
            <tr>
              <th>Lender</th>
              <th className="text-right">Principal</th>
              <th className="text-right">Share</th>
              <th className="text-right">Interest carried</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([lender, entry]) => (
              <tr key={lender}>
                <td>
                  <Party name={view.name(lender)} />
                </td>
                <td className="text-right">{formatCents(toCents(entry.principal))}</td>
                <td className="text-right">{formatShare(toCents(entry.principal), total)}</td>
                <td className="text-right">{formatCents(toCents(entry.carried))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </Panel>
  );
}

function Trail({ view, audit, unit }: { view: View; audit: Audit; unit: string }) {
  const rows = [...audit.rows].reverse();
  return (
    <Panel
      title="Audit trail"
      note="Newest first. One line per transaction the auditor witnessed, with the checks run against it."
    >
      <div className="mb-6 flex justify-end">
        <a href="/auditor/report" download className="btn-ghost">
          Download CSV
        </a>
      </div>
      <TableScroll>
        <table className="table-data">
          <thead>
            <tr>
              <th>When</th>
              <th>Step</th>
              <th className="text-right">Amount ({unit})</th>
              <th>Checks</th>
              <th>Update id</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <TrailLine key={row.updateId} view={view} row={row} />
            ))}
          </tbody>
        </table>
      </TableScroll>
    </Panel>
  );
}

function TrailLine({ view, row }: { view: View; row: TrailRow }) {
  const failed = row.checks.filter((c) => !c.ok).length;
  return (
    <tr className="align-top">
      <td className="whitespace-nowrap text-[13px] text-pewter">{formatTime(row.at)}</td>
      <td className="min-w-[16rem]">
        <span className="block font-semibold text-paper">{row.event}</span>
        <span className="mt-0.5 block text-[13px] text-pewter">{row.detail}</span>
        {row.legs.length > 0 ? (
          <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            {row.legs.map((leg) => (
              <span key={leg.lender} className="inline-flex items-center gap-2 tabular-nums text-smoke">
                <Party name={view.name(leg.lender)} />
                {formatCents(leg.paid)}
              </span>
            ))}
          </span>
        ) : null}
      </td>
      <td className="text-right tabular-nums">{row.amount === null ? "—" : formatCents(row.amount)}</td>
      <td className="min-w-[15rem]">
        {row.checks.length === 0 ? (
          <span className="text-ash">—</span>
        ) : (
          <span className="block space-y-1.5">
            <Tag tone={failed === 0 ? "ok" : "stop"}>{failed === 0 ? "All pass" : `${failed} failed`}</Tag>
            {row.checks.map((check) => (
              <span key={check.label} className="flex items-start gap-2 text-[13px] text-pewter">
                <span aria-hidden className={check.ok ? "text-mint" : "text-rose"}>
                  {check.ok ? "✓" : "✕"}
                </span>
                {check.label}
              </span>
            ))}
          </span>
        )}
      </td>
      <td className="min-w-[12rem]">
        <UpdateId id={row.updateId} />
      </td>
    </tr>
  );
}

function NeverReceived({ audit }: { audit: Audit }) {
  const events = [...audit.received.values()].reduce((a, b) => a + b, 0);
  return (
    <Panel
      title="What the auditor never received"
      note={`Counted across all ${events} events in the ${audit.transactions} transactions the auditor witnessed, not only the contracts it holds. In a trade it receives the register update and the buyer's clearance being used up, never the ticket beside it.`}
    >
      <ul className="grid gap-x-8 sm:grid-cols-2">
        {NEVER.map((item) => {
          const count = item.templates.reduce((sum, t) => sum + (audit.received.get(t) ?? 0), 0);
          return (
            <li key={item.label} className="flex items-center justify-between gap-4 border-t border-white/10 py-3.5">
              <span className="text-paper">{item.label}</span>
              {count === 0 ? <Tag tone="ok">Never received</Tag> : <Tag tone="stop">{`Received ${count}`}</Tag>}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
