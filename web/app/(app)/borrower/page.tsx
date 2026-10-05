// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import * as act from "@/app/(app)/actions";
import { ActionForm } from "@/components/app/ActionForm";
import { LedgerUnavailable } from "@/components/app/LedgerUnavailable";
import { ReleaseCash } from "@/components/app/ReleaseCash";
import { Empty, Facts, Field, PageHeader, Panel, Stats, TableScroll, Tag } from "@/components/app/ui";
import { formatDate, formatTime } from "@/lib/pari/dates";
import { balanceCents, facilityOf, outstandingCents, paymentLabel, requestState } from "@/lib/pari/deal";
import { allInRate, formatCents, formatMoney, formatRate, interestDueCents } from "@/lib/pari/money";
import { LENDERS, persona } from "@/lib/pari/personas";
import { isUnavailable, viewAs, type View } from "@/lib/pari/session";
import type * as P from "@/lib/pari/types";

export const metadata: Metadata = { title: "Borrower" };

export default async function BorrowerPage() {
  const northwind = persona("northwind");
  const view = await viewAs(northwind);
  if (isUnavailable(view)) return <LedgerUnavailable problem={view} />;
  const facility = facilityOf(view.s);
  if (!facility) {
    return <LedgerUnavailable problem={{ unavailable: "cast", detail: "The demo facility is not on this ledger yet." }} />;
  }

  const f = facility.payload;
  const rate = f.period ? allInRate(f.period.baseRate, f.terms.marginBps) : null;

  return (
    <div className="space-y-12">
      <PageHeader
        kicker="Borrower"
        title="Northwind"
        lede="Fund payments from your own holdings, give notice of prepayments, keep the DQ list and post documents. Trade prices never reach Northwind: a ticket stays between buyer, seller and agent."
      >
        <Facts
          items={[
            { label: "Facility", value: f.terms.name },
            { label: "Commitment", value: `${formatMoney(f.terms.commitment)} USD` },
            { label: "Matures", value: formatDate(f.terms.maturityDate) },
          ]}
        />
      </PageHeader>

      <Stats
        items={[
          { label: "Outstanding (USD)", value: formatCents(outstandingCents(f)) },
          { label: "Cash (USD)", value: formatCents(balanceCents(view.s, view.party, f.terms.instrumentId)) },
          { label: "All-in rate", value: rate ? formatRate(rate) : "Not fixed" },
          { label: f.period ? "Period ends" : "Paid through", value: formatDate(f.period?.end ?? f.paidThrough) },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <ToPay view={view} facility={f} rate={rate} />
        <Prepay view={view} />
      </div>

      <ReleaseCash view={view} persona={northwind} />

      <div className="grid gap-6 lg:grid-cols-12">
        <DqList view={view} />
        <Documents view={view} />
      </div>
    </div>
  );
}

function ToPay({ view, facility: f, rate }: { view: View; facility: P.Facility; rate: string | null }) {
  const state = requestState(view.s, f);

  if (!state) {
    const period = f.period;
    const projected =
      period && rate
        ? f.register.reduce((sum, [, entry]) => sum + interestDueCents(entry, rate, period.end), 0n)
        : null;
    return (
      <Panel title="To pay" note="The agent requests each payment; Northwind funds it." className="lg:col-span-7">
        <Empty>
          {period && projected !== null
            ? `Nothing requested yet. Interest of about ${formatCents(projected)} USD falls due on ${formatDate(period.end)}.`
            : "Nothing requested. The agent fixes the next period's rate first."}
        </Empty>
      </Panel>
    );
  }

  const { request, legs, fundedBp } = state;
  const unfunded = legs.filter((leg) => !leg.allocation).length;
  const total = legs.reduce((sum, leg) => sum + leg.due, 0n);
  return (
    <Panel
      title="To pay"
      note="Each leg becomes a CIP-56 allocation from Northwind's own holdings, which only the agent can execute and only into that lender's account. Fund less than 100% and every lender receives the same fraction; the rest stays owed."
      aside={
        unfunded === 0 ? (
          <Tag tone="paper">{fundedBp === null ? "Funded" : `Funded ${fundedBp / 100}%`}</Tag>
        ) : (
          <Tag tone="signal">Awaiting funds</Tag>
        )
      }
      className="lg:col-span-7"
    >
      <div>
        <p className="label-data">{paymentLabel(request.payload.kind)} (USD)</p>
        <p className="mt-2 text-4xl font-light tabular-nums">{formatCents(total)}</p>
      </div>
      <TableScroll>
        <table className="table-data">
          <thead>
            <tr>
              <th>Lender</th>
              <th className="text-right">Due</th>
              <th className="text-right">Allocated</th>
            </tr>
          </thead>
          <tbody>
            {legs.map((leg) => (
              <tr key={leg.legId}>
                <td>{view.name(leg.lender)}</td>
                <td className="text-right">{formatCents(leg.due)}</td>
                <td className={`text-right ${leg.allocation ? "" : "text-ash"}`}>
                  {leg.allocation ? formatMoney(leg.allocation.payload.allocation.transferLeg.amount) : "Not funded"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {unfunded === 0 ? (
        <p className="text-sm text-smoke">Every leg is funded. The agent settles them together.</p>
      ) : (
        <ActionForm action={act.fundRequest} label="Fund every leg" className="space-y-5">
          <Field label="Share of each leg to pay (%)">
            <input
              name="percent"
              type="number"
              defaultValue="100"
              min="0.01"
              max="100"
              step="0.01"
              className="field"
              required
            />
          </Field>
        </ActionForm>
      )}
    </Panel>
  );
}

function Prepay({ view }: { view: View }) {
  return (
    <Panel
      title="Prepay principal"
      note="Principal moves only on Northwind's own notice. The agent turns it into pro-rata legs between interest periods; it cannot start one itself."
      className="lg:col-span-5"
    >
      <ActionForm action={act.noticePrepayment} label="Give notice" className="space-y-5">
        <Field label="Amount (USD)">
          <input name="amount" inputMode="decimal" placeholder="25,000,000" className="field" required />
        </Field>
      </ActionForm>
      {view.s.notices.map((notice) => (
        <div key={notice.contractId} className="flex items-center justify-between gap-4 border-t border-white/10 pt-5">
          <p className="text-lg tabular-nums">{formatMoney(notice.payload.amount)} USD</p>
          <Tag tone="signal">With the agent</Tag>
        </div>
      ))}
    </Panel>
  );
}

function DqList({ view }: { view: View }) {
  const { s, cast, name } = view;
  const list = s.dqLists[0];
  const listed = new Set(list?.payload.disqualified.map.map(([party]) => party) ?? []);
  const screenings = [...s.screenings].sort((a, b) => (a.payload.screenedAt < b.payload.screenedAt ? 1 : -1));
  return (
    <Panel
      title="DQ list"
      note="Parties Northwind refuses as lenders. Only Northwind and the agent can see it. A buyer is screened against it before any trade settles, and never sees the list or its own result."
      className="lg:col-span-5"
    >
      <ActionForm action={act.updateDqList} label="Save DQ list" className="space-y-5">
        <fieldset className="space-y-px">
          <legend className="sr-only">Disqualified parties</legend>
          {LENDERS.map((lender) => (
            <label
              key={lender.id}
              className="flex cursor-pointer items-center justify-between gap-4 border-t border-white/10 py-3"
            >
              <span>
                <span className="text-paper">{lender.name}</span>
                <span className="ml-3 text-xs text-ash">{lender.blurb}</span>
              </span>
              <input
                type="checkbox"
                name="dq"
                value={lender.id}
                defaultChecked={listed.has(cast[lender.castKey])}
                className="h-4 w-4 accent-paper"
              />
            </label>
          ))}
        </fieldset>
      </ActionForm>
      {screenings.length > 0 ? (
        <div className="space-y-3 border-t border-white/10 pt-5">
          <p className="label-data">Screenings run by the agent</p>
          {screenings.map((r) => (
            <div key={r.contractId} className="flex items-center justify-between gap-4 text-sm">
              <span>
                {name(r.payload.candidate)}
                <span className="ml-3 text-xs text-ash">{formatTime(r.payload.screenedAt)}</span>
              </span>
              {r.payload.cleared ? <Tag tone="paper">Cleared</Tag> : <Tag tone="alert">Disqualified</Tag>}
            </div>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}

function Documents({ view }: { view: View }) {
  const { s, name } = view;
  return (
    <Panel
      title="Documents"
      note="Posted by Northwind and classified by it. Each one is a hash and a data-room link; the agent decides who receives it, within the wall."
      className="lg:col-span-7"
    >
      {s.documents.length === 0 ? (
        <Empty>No documents posted.</Empty>
      ) : (
        <TableScroll>
          <table className="table-data">
            <thead>
              <tr>
                <th>Document</th>
                <th>SHA-256</th>
                <th>Shared with</th>
              </tr>
            </thead>
            <tbody>
              {s.documents.map((doc) => {
                const holders = s.accesses
                  .filter((a) => a.payload.docId === doc.payload.docId)
                  .map((a) => name(a.payload.lender));
                return (
                  <tr key={doc.contractId}>
                    <td className="min-w-[16rem] whitespace-normal">
                      <span className="flex items-center gap-3">
                        {doc.payload.title}
                        {doc.payload.mnpi ? <Tag tone="paper">MNPI</Tag> : null}
                      </span>
                    </td>
                    <td className="font-mono text-xs text-smoke">
                      {doc.payload.sha256.slice(0, 8)}…{doc.payload.sha256.slice(-4)}
                    </td>
                    <td className="text-smoke">{holders.length ? holders.join(", ") : "No one yet"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Panel>
  );
}
