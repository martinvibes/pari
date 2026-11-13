// SPDX-License-Identifier: Apache-2.0

import * as act from "@/app/(app)/near-actions";
import { ActionForm } from "@/components/app/ActionForm";
import { Empty, Field, PageHeader, Panel, Stats, TableScroll, Tag } from "@/components/app/ui";
import { DealFacts, NearUnavailable, PaymentsMade, Register, Sealed, Sides, TradeStatus } from "@/components/near/parts";
import type { DealView, PublicState, Request } from "@/lib/near/books";
import { accountOf } from "@/lib/near/config";
import { cents, showCents, showRate } from "@/lib/near/money";
import { isDealView, isUnavailable, viewAs } from "@/lib/near/session";
import { formatDate } from "@/lib/pari/dates";
import { formatCents } from "@/lib/pari/money";
import { PERSONAS, persona } from "@/lib/pari/personas";

export async function BorrowerScreen() {
  const seen = await viewAs(persona("northwind"));
  if (isUnavailable(seen)) return <NearUnavailable problem={seen} />;
  if (!isDealView(seen)) return <NearUnavailable problem={{ unavailable: "deal", detail: "The borrower's envelope is not the borrower's view." }} />;
  const { view, chain, wallet } = seen;
  const open = view.requests.find((r) => r.status === "open");
  const paid = view.requests.reduce((sum, r) => sum + Object.values(r.paid).reduce((s, p) => s + cents(p), 0n), 0n);

  return (
    <div className="space-y-12">
      <PageHeader
        kicker="Borrower"
        title="Northwind"
        party="Northwind"
        lede="Pay what the agent requests, keep the DQ list, and see who holds the loan. A payment is one transfer into the contract; how it is shared among the lenders stays in the books."
      >
        <DealFacts chain={chain} />
      </PageHeader>

      <Stats
        items={[
          { label: "Outstanding (USDC)", value: showCents(view.outstanding) },
          { label: "All-in rate", value: view.rate_bps === null ? "Not fixed" : showRate(view.rate_bps) },
          { label: "Interest paid (USDC)", value: formatCents(paid) },
          { label: "Wallet (test USDC)", value: formatCents(wallet) },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-12">
        {open ? <PaymentDue request={open} chain={chain} /> : <NothingDue view={view} />}
        <DqList view={view} />
      </div>

      <Register
        view={view}
        note="Who holds the loan. The borrower sees every lender's principal; no lender sees another's."
      />
      <Trades view={view} />
      <PaymentsMade requests={view.requests} note="What each lender received from Northwind's payments. The chain shows only each payment's total." />
      {cents(view.cash) > 0n ? <SpareCash cash={cents(view.cash)} /> : null}
      <Sealed seen={seen} />
    </div>
  );
}

function PaymentDue({ request, chain }: { request: Request; chain: PublicState }) {
  const total = cents(request.total);
  const funded = cents(request.funded);
  const remaining = total - funded;
  const onChain = chain.requests[String(request.id)];
  return (
    <Panel
      title="Payment due"
      note="One transfer of test USDC into the contract. The agent then settles it: every lender is credited in one step, and never more than was paid in."
      aside={<Tag tone={remaining === 0n ? "ok" : "wait"}>{remaining === 0n ? "Paid, awaiting settlement" : "Due"}</Tag>}
      className="lg:col-span-7"
    >
      <div>
        <p className="label-data">Interest to {formatDate(request.period_end)} (USDC)</p>
        <p className="mt-2 text-4xl font-medium tabular-nums">{formatCents(total)}</p>
        {onChain ? (
          <p className="mt-2 text-xs text-ash">
            On the public chain: total {showCents(onChain.total)}, paid in {showCents(onChain.funded)}.
          </p>
        ) : null}
      </div>
      {remaining > 0n ? (
        <>
          <ActionForm action={act.payRequest} label="Pay" hidden={{ request: String(request.id) }} className="space-y-5">
            <Field label="Amount (test USDC)">
              <input name="amount" defaultValue={formatCents(remaining)} inputMode="decimal" className="field" required />
            </Field>
          </ActionForm>
          <p className="text-xs leading-relaxed text-ash">
            Pay less to see a short payment: every lender gets the same fraction, and the rest stays owed.
          </p>
        </>
      ) : null}
    </Panel>
  );
}

function NothingDue({ view }: { view: DealView }) {
  return (
    <Panel title="Payment due" note="The agent requests each period's interest once the rate is fixed." className="lg:col-span-7">
      <Empty>
        Nothing is due. Interest is paid through {formatDate(view.paid_through)}
        {view.period ? `; the current period ends ${formatDate(view.period.end)}.` : "."}
      </Empty>
    </Panel>
  );
}

function DqList({ view }: { view: DealView }) {
  const listed = new Set(view.dq_list ?? []);
  const holders = new Set(Object.keys(view.register));
  // Anyone who is not already a lender can be refused; a listed name stays shown.
  const candidates = PERSONAS.filter((p) => p.role === "lender" && (!holders.has(accountOf(p.id)) || listed.has(accountOf(p.id))));
  return (
    <Panel
      title="DQ list"
      note="Buyers Northwind refuses as lenders. The list travels to the enclave sealed, so the chain carries only ciphertext. A buyer is screened against it when a trade settles, and never sees the list or its own result."
      aside={<Tag tone="private">Sealed</Tag>}
      className="lg:col-span-5"
    >
      <ActionForm action={act.updateDqList} label="Save DQ list" className="space-y-5">
        <fieldset className="space-y-px">
          <legend className="sr-only">Disqualified parties</legend>
          {candidates.map((buyer) => (
            <label key={buyer.id} className="flex cursor-pointer items-center justify-between gap-4 border-t border-white/10 py-3">
              <span>
                <span className="text-paper">{buyer.name}</span>
                <span className="ml-3 text-xs text-ash">{buyer.blurb}</span>
              </span>
              <input type="checkbox" name="dq" value={buyer.id} defaultChecked={listed.has(accountOf(buyer.id))} className="h-4 w-4 accent-paper" />
            </label>
          ))}
        </fieldset>
      </ActionForm>
    </Panel>
  );
}

function Trades({ view }: { view: DealView }) {
  return (
    <Panel
      title="Trades in the loan"
      note="Northwind sees who sold to whom, how much and when, because its lenders change. It never sees a price: that is between the seller, the buyer and the agent."
    >
      {view.trades.length === 0 ? (
        <Empty>No trades yet.</Empty>
      ) : (
        <TableScroll>
          <table className="table-data">
            <thead>
              <tr>
                <th>Seller → buyer</th>
                <th className="text-right">Par</th>
                <th>Trade date</th>
                <th>Status</th>
                <th className="text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {[...view.trades].reverse().map((trade) => (
                <tr key={trade.id}>
                  <td>
                    <Sides trade={trade} />
                  </td>
                  <td className="text-right">{showCents(trade.par)}</td>
                  <td className="text-smoke">{formatDate(trade.trade_date)}</td>
                  <td>
                    <TradeStatus trade={trade} />
                  </td>
                  <td className="text-right text-ash">Not in this envelope</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Panel>
  );
}

function SpareCash({ cash }: { cash: bigint }) {
  return (
    <Panel title="Cash in the books" note="Paid in beyond what was requested. It is Northwind's, and can be withdrawn to Northwind's own NEAR account.">
      <ActionForm action={act.withdraw} label="Withdraw" hidden={{ persona: "northwind" }} className="max-w-sm space-y-5">
        <Field label="Amount (test USDC)">
          <input name="amount" defaultValue={formatCents(cash)} inputMode="decimal" className="field" required />
        </Field>
      </ActionForm>
    </Panel>
  );
}
