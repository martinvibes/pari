// SPDX-License-Identifier: Apache-2.0

import * as act from "@/app/(app)/near-actions";
import { ActionForm } from "@/components/app/ActionForm";
import { Empty, Field, PageHeader, Panel, Stats, TableScroll, Tag } from "@/components/app/ui";
import { DealFacts, NearUnavailable, Sealed, seatOf, Sides, TradeStatus } from "@/components/near/parts";
import type { PartyView } from "@/lib/near/books";
import { cents, showCents, showPrice, showRate } from "@/lib/near/money";
import { isPartyView, isUnavailable, viewAs, type Seen } from "@/lib/near/session";
import { addDays, clampDate, formatDate } from "@/lib/pari/dates";
import { formatCents } from "@/lib/pari/money";
import { LENDERS, type Persona } from "@/lib/pari/personas";

/** What a buyer needs in the books before a 10,000,000.00 trade can settle. */
const BUY_IN = 12_000_000_00n;
const ROUND_WITHDRAWAL = 500_000_00n;
const TRADE_SIZE = 10_000_000_00n;

export async function LenderScreen({ persona }: { persona: Persona }) {
  const seen = await viewAs(persona);
  if (isUnavailable(seen)) return <NearUnavailable problem={seen} />;
  if (!isPartyView(seen)) return <NearUnavailable problem={{ unavailable: "deal", detail: `${persona.name}'s envelope is not a lender's view.` }} />;
  const { view, chain, wallet, account } = seen;
  const principal = cents(view.position?.principal);
  const received = view.payments.reduce((sum, p) => sum + cents(p.paid), 0n);

  return (
    <div className="space-y-12">
      <PageHeader
        kicker={seatOf(persona)}
        title={persona.name}
        party={persona.name}
        lede={`Your position, your payments and your trades. ${persona.name}'s envelope holds ${persona.name}'s line of the books and nothing else: no other lender's holding, no register, no DQ list.`}
      >
        <DealFacts chain={chain} />
      </PageHeader>

      <Stats
        items={[
          { label: "Principal (USDC)", value: view.position ? formatCents(principal) : "None" },
          { label: view.period ? "Interest due at period end" : "Interest carried", value: showCents(view.interest_due ?? view.position?.carried) },
          { label: "Received (USDC)", value: formatCents(received) },
          { label: "Cash in the books", value: showCents(view.cash) },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <Payments view={view} />
        <Cash persona={persona} cash={cents(view.cash)} wallet={wallet} holdsLoan={principal > 0n} />
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <Trades seen={seen} account={account} />
        {principal > 0n ? <Sell persona={persona} view={view} principal={principal} /> : null}
      </div>

      <Sealed seen={seen} />
    </div>
  );
}

function Payments({ view }: { view: PartyView }) {
  return (
    <Panel
      title="Your payments"
      note={
        view.rate_bps === null
          ? "Interest you were paid. Other lenders' payments are not in this envelope."
          : `Interest at ${showRate(view.rate_bps)} all-in, ACT/360. Other lenders' payments are not in this envelope.`
      }
      className="lg:col-span-7"
    >
      {view.payments.length === 0 ? (
        <Empty>No payments yet. The agent requests interest at the end of each period.</Empty>
      ) : (
        <TableScroll>
          <table className="table-data">
            <thead>
              <tr>
                <th>Payment</th>
                <th className="text-right">Due</th>
                <th className="text-right">Paid (USDC)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {[...view.payments].reverse().map((payment) => (
                <tr key={payment.request_id}>
                  <td className="whitespace-nowrap">Interest to {formatDate(payment.period_end)}</td>
                  <td className="text-right text-smoke">{showCents(payment.due)}</td>
                  <td className="text-right">{payment.paid === null ? "" : showCents(payment.paid)}</td>
                  <td>{payment.status === "settled" ? <Tag tone="ok">Paid</Tag> : <Tag tone="wait">Requested</Tag>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Panel>
  );
}

function Cash({ persona, cash, wallet, holdsLoan }: { persona: Persona; cash: bigint; wallet: bigint; holdsLoan: boolean }) {
  const takeOut = cash < ROUND_WITHDRAWAL ? cash : ROUND_WITHDRAWAL;
  return (
    <Panel
      title="Cash"
      note="Payments land as cash in the books, where nobody else can see them. Paying in and withdrawing are token transfers, so the chain shows those two amounts."
      className="lg:col-span-5"
    >
      <dl className="grid grid-cols-2 gap-4">
        <div>
          <dt className="label-data">In the books</dt>
          <dd className="mt-2 text-2xl font-medium tabular-nums">{formatCents(cash)}</dd>
        </div>
        <div>
          <dt className="label-data">Wallet (test USDC)</dt>
          <dd className="mt-2 text-2xl font-medium tabular-nums text-smoke">{formatCents(wallet)}</dd>
        </div>
      </dl>
      {cash > 0n ? (
        <ActionForm action={act.withdraw} label="Withdraw" variant={holdsLoan ? "solid" : "ghost"} hidden={{ persona: persona.id }} className="space-y-4">
          <Field label="Withdraw to your NEAR account">
            <input name="amount" defaultValue={formatCents(takeOut)} inputMode="decimal" className="field" required />
          </Field>
        </ActionForm>
      ) : null}
      <ActionForm action={act.depositCash} label="Pay in" variant={holdsLoan ? "ghost" : "solid"} hidden={{ persona: persona.id }} className="space-y-4">
        <Field label="Pay in, to buy into the loan">
          <input name="amount" defaultValue={formatCents(BUY_IN)} inputMode="decimal" className="field" required />
        </Field>
      </ActionForm>
    </Panel>
  );
}

function Sell({ persona, view, principal }: { persona: Persona; view: PartyView; principal: bigint }) {
  const buyers = LENDERS.filter((l) => l.id !== persona.id);
  const from = view.period?.start ?? view.paid_through;
  const to = view.period?.end ?? view.facility.maturity;
  return (
    <Panel
      title="Sell part of your position"
      note="The buyer, the size and the price go to the enclave sealed. The chain shows that an offer was made, and nothing about it."
      aside={<Tag tone="private">Sealed</Tag>}
      className="lg:col-span-5"
    >
      <ActionForm action={act.offerTrade} label="Offer trade" hidden={{ persona: persona.id }} className="space-y-5">
        <Field label="Buyer">
          <select name="buyer" className="field bg-carbon" defaultValue={buyers.find((b) => b.seat === "buyer")?.id}>
            {buyers.map((buyer) => (
              <option key={buyer.id} value={buyer.id}>
                {buyer.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Par amount (USDC)">
            <input name="amount" inputMode="decimal" defaultValue={formatCents(principal < TRADE_SIZE ? principal : TRADE_SIZE)} className="field" required />
          </Field>
          <Field label="Price (% of par)">
            <input name="price" inputMode="decimal" defaultValue="99.50" className="field" required />
          </Field>
        </div>
        <Field label="Trade date">
          <input name="date" type="date" defaultValue={clampDate(addDays(from, 30), from, to)} min={from} max={to} className="field" required />
        </Field>
      </ActionForm>
      <p className="text-xs leading-relaxed text-ash">
        You keep the interest earned up to the trade date; the buyer earns from that date on.
        {view.period ? "" : " The agent has not fixed a rate for the next period, so a trade cannot settle yet."}
      </p>
    </Panel>
  );
}

function Trades({ seen, account }: { seen: Seen<PartyView>; account: string }) {
  const { view, persona } = seen;
  const sells = cents(view.position?.principal) > 0n;
  return (
    <Panel
      title="Your trades"
      note="Only the seller, the buyer and the agent see a trade's price. If a trade does not settle, nothing moves, and this screen is told no more than that."
      className={sells ? "lg:col-span-7" : "lg:col-span-12"}
    >
      {view.trades.length === 0 ? (
        <Empty>No trades. {sells ? "Offer one on the right." : "A lender can offer you part of its position."}</Empty>
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
                  <td>
                    <div className="flex justify-end">
                      {trade.status === "offered" && trade.buyer === account ? (
                        <ActionForm action={act.acceptTrade} label="Accept" variant="ghost" hidden={{ persona: persona.id, trade: String(trade.id) }} />
                      ) : trade.status === "offered" ? (
                        <span className="text-xs text-ash">Awaiting the buyer</span>
                      ) : trade.status === "accepted" ? (
                        <span className="text-xs text-ash">Awaiting the agent</span>
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
