// SPDX-License-Identifier: Apache-2.0

import * as act from "@/app/(app)/near-actions";
import { ActionForm } from "@/components/app/ActionForm";
import { Lit, Steps } from "@/components/app/Screen";
import { Empty, Field, Panel, Stats, Tag } from "@/components/app/ui";
import { Desk } from "@/components/near/Desk";
import { CYCLE, cycleAt, Figure, LitTitle, NearUnavailable, Next, PaymentsMade, Register, TradesTable } from "@/components/near/parts";
import type { DealView, Request } from "@/lib/near/books";
import { accountOf } from "@/lib/near/config";
import { cents, showCents, showRate } from "@/lib/near/money";
import { isDealView, isUnavailable, recordSoFar, viewAs } from "@/lib/near/session";
import { formatDate } from "@/lib/pari/dates";
import { formatCents } from "@/lib/pari/money";
import { PERSONAS, persona } from "@/lib/pari/personas";

const SPLIT = "grid lg:grid-cols-[372px_minmax(0,1fr)]";
const PANE = "border-t border-white/[0.08] p-6 lg:border-l lg:border-t-0";

export async function BorrowerScreen() {
  const [seen, record] = await Promise.all([viewAs(persona("northwind")), recordSoFar()]);
  if (isUnavailable(seen)) return <NearUnavailable problem={seen} />;
  if (!isDealView(seen)) return <NearUnavailable problem={{ unavailable: "deal", detail: "The borrower's envelope is not the borrower's view." }} />;
  const { view, wallet } = seen;
  const open = view.requests.find((r) => r.status === "open");
  const paid = view.requests.reduce((sum, r) => sum + Object.values(r.paid).reduce((s, p) => s + cents(p), 0n), 0n);
  const tracker = <Steps steps={CYCLE} at={cycleAt(view)} />;

  return (
    <Desk seen={seen} record={record}>
      <Stats
        items={[
          { label: "Outstanding (USDC)", value: showCents(view.outstanding) },
          { label: "All-in rate", value: view.rate_bps === null ? "Not fixed" : showRate(view.rate_bps) },
          { label: "Interest paid (USDC)", value: formatCents(paid) },
          { label: "Wallet (test USDC)", value: formatCents(wallet) },
        ]}
      />

      {open ? <PaymentDue request={open} tracker={tracker} /> : <NothingDue view={view} tracker={tracker} />}

      <div className="grid gap-x-10 gap-y-6 min-[1760px]:grid-cols-2">
        <Register view={view} aside="Who holds the loan" />
        <DqList view={view} />
      </div>
      <Panel title="Trades in the loan" aside="No price: that is between the seller, the buyer and the agent">
        {view.trades.length === 0 ? <Empty>No trades yet.</Empty> : <TradesTable trades={view.trades} prices={false} />}
      </Panel>
      <PaymentsMade requests={view.requests} aside="The chain shows only each payment's total" />
      {cents(view.cash) > 0n ? <SpareCash cash={cents(view.cash)} /> : null}
    </Desk>
  );
}

function PaymentDue({ request, tracker }: { request: Request; tracker: React.ReactNode }) {
  const total = cents(request.total);
  const funded = cents(request.funded);
  const remaining = total - funded;
  return (
    <Lit>
      {tracker}
      <div className={SPLIT}>
        <div className="space-y-4 p-6">
          <LitTitle title={remaining > 0n ? "Payment due" : "Paid in full"}>
            <Tag tone={remaining > 0n ? "wait" : "ok"}>{remaining > 0n ? "Due" : "Awaiting settlement"}</Tag>
          </LitTitle>
          <Figure
            label={`Interest to ${formatDate(request.period_end)} (USDC)`}
            note={funded > 0n && remaining > 0n ? `${formatCents(funded)} paid in so far.` : undefined}
          >
            {formatCents(total)}
          </Figure>
          {remaining > 0n ? (
            <ActionForm action={act.payRequest} label="Pay" hidden={{ request: String(request.id) }} className="space-y-4">
              <Field label="Amount (test USDC)">
                <input name="amount" defaultValue={formatCents(remaining)} inputMode="decimal" className="field field-figure" required />
              </Field>
            </ActionForm>
          ) : (
            <Next>The agent settles from its own desk: press 1.</Next>
          )}
        </div>
        <div className={PANE}>
          <p className="text-[12.5px] text-pewter">What paying does</p>
          <p className="mt-2 max-w-md text-[24px] font-light leading-[1.2] tracking-[-0.015em] text-paper">One transfer in. Every lender paid in one step.</p>
          <p className="mt-3 max-w-md text-[13px] leading-relaxed text-pewter">
            The chain shows the one total. How it is shared among the lenders stays in the books, and no lender is credited more than was paid in.
            Pay less to see a short payment: every lender gets the same fraction, and the rest stays owed.
          </p>
        </div>
      </div>
    </Lit>
  );
}

function NothingDue({ view, tracker }: { view: DealView; tracker: React.ReactNode }) {
  return (
    <Lit>
      {tracker}
      <div className="space-y-2 p-6">
        <LitTitle title="Nothing is due" />
        <p className="max-w-2xl text-[14px] leading-relaxed text-smoke">
          Interest is paid through {formatDate(view.paid_through)}.{" "}
          {view.period
            ? `The current period ends ${formatDate(view.period.end)}; the agent requests its interest from its own desk.`
            : "The agent fixes the next period's rate from its own desk."}{" "}
          Press 1.
        </p>
      </div>
    </Lit>
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
      aside={<Tag tone="private">Sealed</Tag>}
      note="Buyers Northwind refuses as lenders. The chain carries only ciphertext. A buyer is screened when a trade settles, and never sees the list or its own result."
    >
      <ActionForm action={act.updateDqList} label="Save DQ list" variant="ghost" className="space-y-3" buttonClassName="h-11 px-5">
        <fieldset className="border-t border-white/[0.08]">
          <legend className="sr-only">Disqualified parties</legend>
          {candidates.map((buyer) => (
            <label key={buyer.id} className="flex h-11 cursor-pointer items-center justify-between gap-4 border-b border-white/[0.08] text-[13.5px]">
              <span>
                <span className="text-paper">{buyer.name}</span>
                <span className="ml-3 text-[12px] text-ash">{buyer.blurb}</span>
              </span>
              <input type="checkbox" name="dq" value={buyer.id} defaultChecked={listed.has(accountOf(buyer.id))} className="h-4 w-4 accent-paper" />
            </label>
          ))}
        </fieldset>
      </ActionForm>
    </Panel>
  );
}

function SpareCash({ cash }: { cash: bigint }) {
  return (
    <Panel title="Cash in the books" aside="Paid in beyond what was requested">
      <ActionForm
        action={act.withdraw}
        label="Withdraw"
        variant="ghost"
        hidden={{ persona: "northwind" }}
        className="grid max-w-md grid-cols-[minmax(0,1fr)_auto] items-end gap-3"
        buttonClassName="h-11 px-5"
      >
        <Field label="Withdraw to Northwind's NEAR account (USDC)">
          <input name="amount" defaultValue={formatCents(cash)} inputMode="decimal" className="field fig text-right" required />
        </Field>
      </ActionForm>
    </Panel>
  );
}
