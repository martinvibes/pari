// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import * as act from "@/app/(app)/actions";
import { ActionForm } from "@/components/app/ActionForm";
import { LedgerUnavailable } from "@/components/app/LedgerUnavailable";
import { Party } from "@/components/app/party";
import { Empty, FACILITY_TONE, Facts, Field, PageHeader, Panel, Stats, TableScroll, Tag } from "@/components/app/ui";
import type { Contract } from "@/lib/ledger/client";
import { addMonths, clampDate, formatDate, formatTime } from "@/lib/pari/dates";
import {
  facilityOf,
  latestScreening,
  outstandingCents,
  paymentLabel,
  requestState,
  tradeAllocation,
  type RequestState,
} from "@/lib/pari/deal";
import {
  allInRate,
  formatCents,
  formatMoney,
  formatPrice,
  formatRate,
  formatShare,
  interestDueCents,
  toCents,
} from "@/lib/pari/money";
import { persona } from "@/lib/pari/personas";
import { isUnavailable, viewAs, type View } from "@/lib/pari/session";
import type * as P from "@/lib/pari/types";

export const metadata: Metadata = { title: "Agent" };

export default async function AgentPage() {
  const view = await viewAs(persona("agent"));
  if (isUnavailable(view)) return <LedgerUnavailable problem={view} />;
  const facility = facilityOf(view.s);
  if (!facility) {
    return <LedgerUnavailable problem={{ unavailable: "cast", detail: "The demo facility is not on this ledger yet." }} />;
  }

  const f = facility.payload;
  const outstanding = outstandingCents(f);
  const rate = f.period ? allInRate(f.period.baseRate, f.terms.marginBps) : null;

  return (
    <div className="space-y-12">
      <PageHeader
        kicker="Administrative agent"
        title="Agent"
        party="Agent"
        lede="Keep the register, fix the rate, request payments and settle trades. The agent never holds the money: every payment is a CIP-56 allocation the payer funds from its own holdings."
      >
        <Facts
          items={[
            { label: "Facility", value: f.terms.name },
            { label: "Status", value: f.status, tone: FACILITY_TONE[f.status] },
            { label: "Margin", value: `${f.terms.marginBps} bp` },
            { label: "Matures", value: formatDate(f.terms.maturityDate) },
          ]}
        />
      </PageHeader>

      <Stats
        items={[
          { label: "Outstanding (USD)", value: formatCents(outstanding) },
          { label: "Lenders", value: String(f.register.length) },
          { label: "All-in rate", value: rate ? formatRate(rate) : "Not fixed" },
          { label: f.period ? "Period ends" : "Paid through", value: formatDate(f.period?.end ?? f.paidThrough) },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <Register view={view} facility={f} rate={rate} outstanding={outstanding} />
        <Payments view={view} facility={f} rate={rate} request={requestState(view.s, f)} />
      </div>

      <Trades view={view} />
      <Documents view={view} />
      <Receipts view={view} />
    </div>
  );
}

function Register({
  view,
  facility: f,
  rate,
  outstanding,
}: {
  view: View;
  facility: P.Facility;
  rate: string | null;
  outstanding: bigint;
}) {
  const rows = [...f.register].sort(([, a], [, b]) => Number(toCents(b.principal) - toCents(a.principal)));
  return (
    <Panel
      title="Register"
      note="Every lender's principal and interest. Only the agent, the borrower and Northwind's auditor hold the register; each lender sees its own line and nothing else."
      className="lg:col-span-7"
    >
      <TableScroll>
        <table className="table-data">
          <thead>
            <tr>
              <th>Lender</th>
              <th className="text-right">Principal</th>
              <th className="text-right">Share</th>
              <th>Accrues from</th>
              <th className="text-right">{f.period ? "Due at period end" : "Interest carried"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([lender, entry]) => (
              <tr key={lender}>
                <td>
                  <Party name={view.name(lender)} />
                </td>
                <td className="text-right">{formatMoney(entry.principal)}</td>
                <td className="text-right text-smoke">{formatShare(toCents(entry.principal), outstanding)}</td>
                <td className="text-smoke">{formatDate(entry.accrualStart)}</td>
                <td className="text-right">
                  {f.period && rate
                    ? formatCents(interestDueCents(entry, rate, f.period.end))
                    : formatMoney(entry.carried)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </Panel>
  );
}

function Payments({
  view,
  facility: f,
  rate,
  request,
}: {
  view: View;
  facility: P.Facility;
  rate: string | null;
  request: RequestState | null;
}) {
  if (request) return <OpenRequest view={view} state={request} />;

  if (f.period && rate) {
    const period = f.period;
    const total = f.register.reduce((sum, [, entry]) => sum + interestDueCents(entry, rate, period.end), 0n);
    return (
      <Panel
        title="Interest period"
        note={`Base ${formatRate(period.baseRate)} plus ${f.terms.marginBps} bp margin, ACT/360, from ${formatDate(period.start)} to ${formatDate(period.end)}.`}
        className="lg:col-span-5"
      >
        <div>
          <p className="label-data">Interest due at period end (USD)</p>
          <p className="mt-2 text-4xl font-medium tabular-nums">{formatCents(total)}</p>
        </div>
        <ActionForm action={act.requestInterest} label="Request interest" />
        <p className="text-xs leading-relaxed text-ash">
          Opens one CIP-56 leg per lender for the borrower to fund. Trades settle within the period;
          prepayments wait until it is paid.
        </p>
      </Panel>
    );
  }

  const notices = view.s.notices;
  return (
    <Panel
      title="Next interest period"
      note="Fix the base rate for the next period. Prepayment notices from the borrower are accepted between periods."
      className="lg:col-span-5"
    >
      <ActionForm action={act.fixRate} label="Fix rate" className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Base rate (%)">
            <input name="rate" defaultValue="4.30" inputMode="decimal" className="field" required />
          </Field>
          <Field label="Period ends">
            <input
              name="end"
              type="date"
              defaultValue={clampDate(addMonths(f.paidThrough, 3), f.paidThrough, f.terms.maturityDate)}
              min={f.paidThrough}
              max={f.terms.maturityDate}
              className="field"
              required
            />
          </Field>
        </div>
      </ActionForm>
      {notices.map((notice) => (
        <div
          key={notice.contractId}
          className="flex items-center justify-between gap-4 border-t border-white/10 pt-5"
        >
          <div>
            <p className="label-data">Prepayment notice</p>
            <p className="mt-1 text-lg tabular-nums">{formatMoney(notice.payload.amount)} USD</p>
          </div>
          <ActionForm
            action={act.acceptPrepayment}
            label="Accept"
            variant="ghost"
            hidden={{ notice: notice.contractId }}
          />
        </div>
      ))}
    </Panel>
  );
}

function OpenRequest({ view, state }: { view: View; state: RequestState }) {
  const { request, legs, fundedBp } = state;
  const total = legs.reduce((sum, leg) => sum + leg.due, 0n);
  const funded = legs.filter((leg) => leg.allocation).length;
  return (
    <Panel
      title="Open request"
      note="One CIP-56 leg per lender, each funded by the borrower from its own holdings. Settling executes every leg in one transaction, or none."
      aside={
        <Tag tone={fundedBp === null ? "wait" : "ok"}>
          {fundedBp === null ? `${funded} of ${legs.length} funded` : `Funded ${fundedBp / 100}%`}
        </Tag>
      }
      className="lg:col-span-5"
    >
      <div>
        <p className="label-data">{paymentLabel(request.payload.kind)} (USD)</p>
        <p className="mt-2 text-4xl font-medium tabular-nums">{formatCents(total)}</p>
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
                <td>
                  <Party name={view.name(leg.lender)} />
                </td>
                <td className="text-right">{formatCents(leg.due)}</td>
                <td className={`text-right ${leg.allocation ? "" : "text-ash"}`}>
                  {leg.allocation ? formatMoney(leg.allocation.payload.allocation.transferLeg.amount) : "Not funded"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      <div className="space-y-3">
        <ActionForm
          action={act.settlePayment}
          label={fundedBp === null ? "Waiting for the borrower" : `Settle all ${legs.length} legs`}
          disabled={fundedBp === null}
        />
        <div className="flex justify-end">
          <ActionForm action={act.cancelRequest} label="Cancel request" variant="ghost" />
        </div>
      </div>
    </Panel>
  );
}

function Trades({ view }: { view: View }) {
  const { s, name } = view;
  return (
    <Panel
      title="Trades to settle"
      note="An agreed trade settles delivery-versus-payment in one transaction: the register records the assignment, the buyer's cash reaches the seller and both positions move. The buyer is screened against the borrower's DQ list first, and never sees the list or the result. Declining a trade moves nothing; the buyer takes its own cash back."
    >
      {s.tickets.length === 0 ? (
        <Empty>No agreed trades. A lender offers one from its own screen, and the buyer accepts and funds it.</Empty>
      ) : (
        <TableScroll>
          <table className="table-data">
            <thead>
              <tr>
                <th>Seller → buyer</th>
                <th className="text-right">Par</th>
                <th className="text-right">Price</th>
                <th className="text-right">Cash</th>
                <th>Trade date</th>
                <th>Cash leg</th>
                <th>DQ screening</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {s.tickets.map((ticket) => {
                const t = ticket.payload;
                const funded = tradeAllocation(s, t) !== undefined;
                const screening = latestScreening(s, t.buyer);
                return (
                  <tr key={ticket.contractId}>
                    <td className="whitespace-nowrap">
                      <Party name={name(t.seller)} /> <span className="px-1 text-ash">→</span>{" "}
                      <Party name={name(t.buyer)} />
                    </td>
                    <td className="text-right">{formatMoney(t.amount)}</td>
                    <td className="text-right">{formatPrice(t.price)}</td>
                    <td className="text-right">{formatMoney(t.cash)}</td>
                    <td className="whitespace-nowrap text-smoke">{formatDate(t.tradeDate)}</td>
                    <td>{funded ? <Tag tone="ok">Funded</Tag> : <Tag tone="wait">Awaiting buyer</Tag>}</td>
                    <td>
                      {!screening ? (
                        <Tag>Not screened</Tag>
                      ) : screening.payload.cleared ? (
                        <Tag tone="ok">Cleared</Tag>
                      ) : (
                        <Tag tone="stop">Disqualified</Tag>
                      )}
                    </td>
                    <td>
                      <div className="flex justify-end gap-2">
                        <ActionForm action={act.screenBuyer} label="Screen" variant="ghost" hidden={{ buyer: t.buyer }} />
                        <ActionForm
                          action={act.settleTrade}
                          label="Settle"
                          variant="ghost"
                          hidden={{ ticket: ticket.contractId }}
                          disabled={!funded || !screening}
                        />
                        <ActionForm
                          action={act.declineTrade}
                          label="Decline"
                          variant="ghost"
                          hidden={{ ticket: ticket.contractId }}
                        />
                      </div>
                    </td>
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

function Documents({ view }: { view: View }) {
  const { s, name } = view;
  const elections = [...s.elections].sort((a, b) => name(a.payload.lender).localeCompare(name(b.payload.lender)));
  const shared = (doc: Contract<P.Document>, lender: string) =>
    s.accesses.some((a) => a.payload.docId === doc.payload.docId && a.payload.lender === lender);
  return (
    <Panel
      title="Documents"
      note="The borrower classifies each document; the agent distributes it. MNPI reaches only lenders that elected private side. Try sharing it with a public-side lender: the ledger refuses."
    >
      {s.documents.length === 0 ? (
        <Empty>The borrower has posted no documents.</Empty>
      ) : (
        <TableScroll>
          <table className="table-data">
            <thead>
              <tr>
                <th>Document</th>
                {elections.map((e) => (
                  <th key={e.contractId}>
                    <Party name={name(e.payload.lender)} className="text-paper" />
                    <span
                      className={`mt-1 block text-[11px] normal-case tracking-normal ${
                        e.payload.side === "PrivateSide" ? "text-iris" : "text-ash"
                      }`}
                    >
                      {e.payload.side === "PrivateSide" ? "Private side" : "Public side"}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.documents.map((doc) => (
                <tr key={doc.contractId}>
                  <td className="min-w-[16rem] whitespace-normal">
                    <span className="flex items-center gap-3">
                      {doc.payload.title}
                      {doc.payload.mnpi ? <Tag tone="private">MNPI</Tag> : null}
                    </span>
                  </td>
                  {elections.map((e) =>
                    shared(doc, e.payload.lender) ? (
                      <td key={e.contractId}>
                        <Tag tone="ok">Shared</Tag>
                      </td>
                    ) : (
                      <td key={e.contractId}>
                        <ActionForm
                          action={act.shareDocument}
                          label="Share"
                          variant="ghost"
                          hidden={{ document: doc.contractId, election: e.contractId }}
                        />
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Panel>
  );
}

function Receipts({ view }: { view: View }) {
  const { s, name } = view;
  const receipts = [...s.receipts].sort((a, b) =>
    a.payload.paidAt === b.payload.paidAt
      ? Number(toCents(b.payload.due) - toCents(a.payload.due))
      : a.payload.paidAt < b.payload.paidAt
        ? 1
        : -1,
  );
  return (
    <Panel
      title="Payments made"
      note="One receipt per lender per payment, co-signed by the agent and that lender. A short payment pays every lender the same fraction; the rest stays owed."
    >
      {receipts.length === 0 ? (
        <Empty>No payments yet.</Empty>
      ) : (
        <TableScroll>
          <table className="table-data">
            <thead>
              <tr>
                <th>Paid</th>
                <th>Lender</th>
                <th>Payment</th>
                <th className="text-right">Due</th>
                <th className="text-right">Paid (USD)</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.contractId}>
                  <td className="whitespace-nowrap text-smoke">{formatTime(r.payload.paidAt)}</td>
                  <td>
                    <Party name={name(r.payload.lender)} />
                  </td>
                  <td>{paymentLabel(r.payload.kind)}</td>
                  <td className="text-right text-smoke">{formatMoney(r.payload.due)}</td>
                  <td className="text-right">{formatMoney(r.payload.paid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Panel>
  );
}
