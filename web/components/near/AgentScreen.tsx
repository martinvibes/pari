// SPDX-License-Identifier: Apache-2.0

import * as act from "@/app/(app)/near-actions";
import { ActionForm } from "@/components/app/ActionForm";
import { Party } from "@/components/app/party";
import { Empty, Field, PageHeader, Panel, Stats, TableScroll, Tag } from "@/components/app/ui";
import { DealFacts, NearUnavailable, PaymentsMade, Register, registerRows, Sealed, Sides, totalDue, TradeStatus } from "@/components/near/parts";
import type { DealView, PublicState, Request } from "@/lib/near/books";
import { cents, showCents, showPrice, showRate } from "@/lib/near/money";
import { isDealView, isUnavailable, nameOf, viewAs } from "@/lib/near/session";
import { addMonths, clampDate, formatDate } from "@/lib/pari/dates";
import { formatCents } from "@/lib/pari/money";
import { persona } from "@/lib/pari/personas";

export async function AgentScreen() {
  const seen = await viewAs(persona("agent"));
  if (isUnavailable(seen)) return <NearUnavailable problem={seen} />;
  if (!isDealView(seen)) return <NearUnavailable problem={{ unavailable: "deal", detail: "The agent's envelope is not the agent's view." }} />;
  const { view, chain } = seen;
  const open = view.requests.find((r) => r.status === "open");

  return (
    <div className="space-y-12">
      <PageHeader
        kicker="Administrative agent"
        title="Agent"
        party="Agent"
        lede="Keep the register, fix the rate, request payments and settle trades. The books live in an enclave; the contract on NEAR checks every payout against what the borrower paid in, so a mistyped total cannot move money."
      >
        <DealFacts chain={chain} />
      </PageHeader>

      <Stats
        items={[
          { label: "Outstanding (USDC)", value: showCents(view.outstanding) },
          { label: "Lenders", value: String(registerRows(view).length) },
          { label: "All-in rate", value: view.rate_bps === null ? "Not fixed" : showRate(view.rate_bps) },
          { label: view.period ? "Period ends" : "Paid through", value: formatDate(view.period?.end ?? view.paid_through) },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <Register
          view={view}
          note="Every lender's principal and interest. Only the agent, the borrower and Northwind's auditor can open the register; each lender's envelope holds its own line and nothing else."
          className="lg:col-span-7"
        />
        {open ? <OpenRequest request={open} chain={chain} /> : view.period ? <RequestInterest view={view} /> : <FixRate view={view} />}
      </div>

      <Trades view={view} />
      <PaymentsMade
        requests={view.requests}
        note="One settlement credits every lender inside the books. A short payment pays every lender the same fraction; the rest stays owed."
      />
      <Sealed seen={seen} />
    </div>
  );
}

function FixRate({ view }: { view: DealView }) {
  return (
    <Panel title="Next interest period" note="Fix the base rate for the next period. Deal dates are inputs, so the demo moves through them on command." className="lg:col-span-5">
      <ActionForm action={act.fixRate} label="Fix rate" className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Base rate (%)">
            <input name="rate" defaultValue="4.30" inputMode="decimal" className="field" required />
          </Field>
          <Field label="Period ends">
            <input
              name="end"
              type="date"
              defaultValue={clampDate(addMonths(view.paid_through, 3), view.paid_through, view.facility.maturity)}
              min={view.paid_through}
              max={view.facility.maturity}
              className="field"
              required
            />
          </Field>
        </div>
      </ActionForm>
    </Panel>
  );
}

function RequestInterest({ view }: { view: DealView }) {
  const period = view.period!;
  return (
    <Panel
      title="Interest period"
      note={`Base ${showRate(period.base_rate_bps)} plus ${view.facility.margin_bps} bp margin, ACT/360, from ${formatDate(period.start)} to ${formatDate(period.end)}.`}
      className="lg:col-span-5"
    >
      <ActionForm action={act.requestInterest} label="Request interest" className="space-y-5">
        <Field label="Total to request (USDC)">
          <input name="total" defaultValue={formatCents(totalDue(view))} inputMode="decimal" className="field" required />
        </Field>
      </ActionForm>
      <p className="text-xs leading-relaxed text-ash">
        The agent types the total, as an operations desk does. The enclave works the total out from the register and refuses any
        other figure. Try 900,000,000.00: in 2020 that mistake left Citibank&apos;s desk as a wire.
      </p>
    </Panel>
  );
}

function OpenRequest({ request, chain }: { request: Request; chain: PublicState }) {
  const total = cents(request.total);
  const funded = cents(request.funded);
  const legs = Object.entries(request.legs).sort(([, a], [, b]) => Number(cents(b) - cents(a)));
  const seenByAll = chain.requests[String(request.id)];
  return (
    <Panel
      title="Open request"
      note="The chain shows this request's total and what the borrower has paid in. The legs below are in the agent's envelope only. Settling credits every lender in one step, or none."
      aside={
        <Tag tone={funded === 0n ? "wait" : funded === total ? "ok" : "info"}>
          {funded === 0n ? "Not funded" : funded === total ? "Fully funded" : `Funded ${formatCents(funded)}`}
        </Tag>
      }
      className="lg:col-span-5"
    >
      <div>
        <p className="label-data">Interest to {formatDate(request.period_end)} (USDC)</p>
        <p className="mt-2 text-4xl font-medium tabular-nums">{formatCents(total)}</p>
        {seenByAll ? (
          <p className="mt-2 text-xs text-ash">
            On the public chain: total {showCents(seenByAll.total)}, paid in {showCents(seenByAll.funded)}.
          </p>
        ) : null}
      </div>
      <TableScroll>
        <table className="table-data">
          <thead>
            <tr>
              <th>Lender</th>
              <th className="text-right">Due</th>
            </tr>
          </thead>
          <tbody>
            {legs.map(([lender, due]) => (
              <tr key={lender}>
                <td>
                  <Party name={nameOf(lender)} />
                </td>
                <td className="text-right">{showCents(due)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      <ActionForm
        action={act.settlePayment}
        label={funded === 0n ? "Waiting for the borrower" : funded === total ? `Settle all ${legs.length} lenders` : "Settle the short payment pro rata"}
        hidden={{ request: String(request.id) }}
        disabled={funded === 0n}
      />
    </Panel>
  );
}

function Trades({ view }: { view: DealView }) {
  return (
    <Panel
      title="Trades to settle"
      note="An accepted trade settles cash against loan in one step, or not at all. At settlement the enclave screens the buyer against the borrower's DQ list. A buyer that fails is told only that the trade did not settle; the reason reaches the agent alone."
    >
      {view.trades.length === 0 ? (
        <Empty>No trades. A lender offers one from its own screen, and the buyer accepts it.</Empty>
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
                <th>Status</th>
                <th>Screening</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {[...view.trades].reverse().map((trade) => (
                <tr key={trade.id}>
                  <td>
                    <Sides trade={trade} />
                  </td>
                  <td className="text-right">{showCents(trade.par)}</td>
                  <td className="text-right">{trade.price_ppm === undefined ? "" : showPrice(trade.price_ppm)}</td>
                  <td className="text-right">{showCents(trade.cash)}</td>
                  <td className="text-smoke">{formatDate(trade.trade_date)}</td>
                  <td>
                    <TradeStatus trade={trade} />
                  </td>
                  <td className={trade.screening ? "whitespace-normal text-rose" : "text-ash"}>
                    {trade.screening ? sentence(trade.screening) : trade.status === "settled" ? "Cleared" : "At settlement"}
                  </td>
                  <td>
                    <div className="flex justify-end">
                      {trade.status === "accepted" ? (
                        <ActionForm action={act.settleTrade} label="Settle" variant="ghost" hidden={{ trade: String(trade.id) }} />
                      ) : trade.status === "offered" ? (
                        <span className="text-xs text-ash">Awaiting the buyer</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Panel>
  );
}

function sentence(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}
