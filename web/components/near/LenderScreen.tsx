// SPDX-License-Identifier: Apache-2.0

import * as act from "@/app/(app)/near-actions";
import { ActionForm } from "@/components/app/ActionForm";
import { Lit, Steps } from "@/components/app/Screen";
import { Field, Panel, Stats, TableScroll, Tag } from "@/components/app/ui";
import { Desk } from "@/components/near/Desk";
import { Figure, LitTitle, NearUnavailable, Next, TradesTable } from "@/components/near/parts";
import { Prove } from "@/components/near/Prove";
import type { PartyView, Trade } from "@/lib/near/books";
import { cents, showCents, showPrice, showRate } from "@/lib/near/money";
import { isPartyView, isUnavailable, nameOf, recordSoFar, viewAs } from "@/lib/near/session";
import { addDays, clampDate, formatDate } from "@/lib/pari/dates";
import { formatCents } from "@/lib/pari/money";
import { LENDERS, type Persona } from "@/lib/pari/personas";

/** What a buyer needs in the books before a 10,000,000.00 trade can settle. */
const BUY_IN = 12_000_000_00n;
const ROUND_WITHDRAWAL = 500_000_00n;
const TRADE_SIZE = 10_000_000_00n;

/** Buying into the loan, as a buyer's desk names the steps. */
const BUYING = ["Pay in", "A lender offers", "Accept", "Agent settles"];

const SPLIT = "grid lg:grid-cols-[372px_minmax(0,1fr)]";
const PANE = "border-t border-white/[0.08] p-6 lg:border-l lg:border-t-0";
const INLINE = "grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3";

export async function LenderScreen({ persona }: { persona: Persona }) {
  const [seen, record] = await Promise.all([viewAs(persona), recordSoFar()]);
  if (isUnavailable(seen)) return <NearUnavailable problem={seen} />;
  if (!isPartyView(seen)) return <NearUnavailable problem={{ unavailable: "deal", detail: `${persona.name}'s envelope is not a lender's view.` }} />;
  const { view, wallet, account } = seen;
  const principal = cents(view.position?.principal);
  const cash = cents(view.cash);
  const received = view.payments.reduce((sum, p) => sum + cents(p.paid), 0n);
  const buying = view.trades.filter((trade) => trade.buyer === account);
  const offer = buying.find((trade) => trade.status === "offered");
  const accepted = buying.find((trade) => trade.status === "accepted");
  const turnedDown = principal === 0n && buying.at(-1)?.status === "not_settled";
  // The lit card holds the pay-in for a buyer with nothing in the books.
  const payInAbove = !offer && !accepted && principal === 0n && !turnedDown && cash === 0n;

  return (
    <Desk seen={seen} record={record}>
      <Stats
        items={[
          { label: "Principal (USDC)", value: view.position ? formatCents(principal) : "None" },
          { label: view.period ? "Interest due at period end" : "Interest carried", value: showCents(view.interest_due ?? view.position?.carried) },
          { label: "Received (USDC)", value: formatCents(received) },
          { label: "Cash in the books", value: formatCents(cash), note: `wallet ${formatCents(wallet)}` },
        ]}
      />

      {offer ? (
        <Offer persona={persona} trade={offer} cash={cash} />
      ) : accepted ? (
        <Accepted persona={persona} trade={accepted} cash={cash} />
      ) : principal > 0n ? (
        <Interest persona={persona} view={view} />
      ) : turnedDown ? (
        <TurnedDown />
      ) : (
        <BuyIn persona={persona} cash={cash} />
      )}

      {view.payments.length > 0 ? <Payments persona={persona} view={view} /> : null}
      {view.trades.length > 0 ? (
        <Panel title="Your trades" aside="Only the seller, the buyer and the agent see a price">
          <TradesTable
            trades={view.trades}
            prices
            act={(trade) =>
              trade.status === "offered" && trade.seller === account ? (
                <span className="text-[12px] text-ash">Awaiting the buyer</span>
              ) : trade.status === "accepted" ? (
                <span className="text-[12px] text-ash">Awaiting the agent</span>
              ) : null
            }
          />
        </Panel>
      ) : null}

      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
        {principal > 0n ? <Sell persona={persona} view={view} principal={principal} /> : null}
        {payInAbove ? null : <Cash persona={persona} cash={cash} />}
      </div>
    </Desk>
  );
}

/** What a trade costs the buyer, and whether the books hold it. */
function need(trade: Trade, cash: bigint): bigint {
  const price = cents(trade.cash);
  return price > cash ? price - cash : 0n;
}

function Terms({ trade }: { trade: Trade }) {
  return (
    <dl className="text-[13.5px]">
      {[
        ["Price (% of par)", trade.price_ppm === undefined ? "" : showPrice(trade.price_ppm)],
        ["Cash to pay (USDC)", showCents(trade.cash)],
        ["Trade date", formatDate(trade.trade_date)],
      ].map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-6 border-t border-white/[0.08] py-2">
          <dt className="text-pewter">{label}</dt>
          <dd className="fig text-paper">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Offer({ persona, trade, cash }: { persona: Persona; trade: Trade; cash: bigint }) {
  const short = need(trade, cash);
  return (
    <Lit>
      <Steps steps={BUYING} at={2} />
      <div className={SPLIT}>
        <div className="space-y-4 p-6">
          <LitTitle title={`${nameOf(trade.seller)} offers you part of the loan`}>
            <Tag tone="wait">Offered</Tag>
          </LitTitle>
          <Figure label="Par (USDC)">{showCents(trade.par)}</Figure>
          <ActionForm action={act.acceptTrade} label="Accept" hidden={{ persona: persona.id, trade: String(trade.id) }} />
        </div>
        <div className={`${PANE} space-y-4`}>
          <Terms trade={trade} />
          <Next>
            The agent settles it next. The enclave checks your cash and moves cash and loan in one step, or neither.{" "}
            {short > 0n ? (
              <span className="text-amber">Pay in {formatCents(short)} more before then: Cash, below.</span>
            ) : (
              "Your cash in the books covers it."
            )}
          </Next>
        </div>
      </div>
    </Lit>
  );
}

function Accepted({ persona, trade, cash }: { persona: Persona; trade: Trade; cash: bigint }) {
  const short = need(trade, cash);
  return (
    <Lit>
      <Steps steps={BUYING} at={3} />
      <div className={SPLIT}>
        <div className="space-y-4 p-6">
          <LitTitle title={short > 0n ? "Pay in before the agent settles" : "Waiting for the agent to settle"}>
            <Tag tone="info">Accepted</Tag>
          </LitTitle>
          <Figure label="Par (USDC)">{showCents(trade.par)}</Figure>
          {short > 0n ? (
            <ActionForm action={act.depositCash} label="Pay in" hidden={{ persona: persona.id }} className="space-y-4">
              <Field label="Pay in (USDC)">
                <input name="amount" defaultValue={formatCents(short)} inputMode="decimal" className="field field-figure" required />
              </Field>
            </ActionForm>
          ) : (
            <Next>The agent settles from its own desk: press 1.</Next>
          )}
        </div>
        <div className={PANE}>
          <Terms trade={trade} />
        </div>
      </div>
    </Lit>
  );
}

function Interest({ persona, view }: { persona: Persona; view: PartyView }) {
  const asked = view.payments.find((payment) => payment.status === "open");
  const last = view.payments.map((payment) => payment.status).lastIndexOf("settled");
  const paid = last < 0 ? null : view.payments[last]!;
  const shortfall = paid ? cents(paid.due) - cents(paid.paid) : 0n;
  return (
    <Lit>
      <div className={SPLIT}>
        <div className="space-y-4 p-6">
          {asked ? (
            <>
              <LitTitle title="Interest requested">
                <Tag tone="wait">Requested</Tag>
              </LitTitle>
              <Figure label={`Due to you for interest to ${formatDate(asked.period_end)} (USDC)`}>{showCents(asked.due)}</Figure>
              <Next>Northwind pays, then one settlement by the agent credits every lender at once.</Next>
            </>
          ) : view.period ? (
            <>
              <LitTitle title="Interest accruing">
                <Tag tone="info">Accruing</Tag>
              </LitTitle>
              <Figure label={`Due to you at period end, ${formatDate(view.period.end)} (USDC)`}>{showCents(view.interest_due)}</Figure>
              <Next>The agent requests it at period end.</Next>
            </>
          ) : paid ? (
            <>
              <LitTitle title="Interest paid">
                <Tag tone="ok">Paid</Tag>
              </LitTitle>
              <Figure
                label={`Paid to you for interest to ${formatDate(paid.period_end)} (USDC)`}
                note={shortfall > 0n ? `Of ${showCents(paid.due)} due. The borrower paid short; ${formatCents(shortfall)} stays owed to you.` : undefined}
              >
                {showCents(paid.paid)}
              </Figure>
              <Prove persona={persona.id} item={`payments.${last}`} label="Prove this payment" variant="solid" />
            </>
          ) : (
            <>
              <LitTitle title="Your position" />
              <Figure label="Principal (USDC)">{showCents(view.position?.principal)}</Figure>
              <Next>The agent fixes the rate for the next period from its own desk.</Next>
            </>
          )}
        </div>
        <div className={PANE}>
          <p className="text-[12.5px] text-pewter">What this key opens</p>
          <p className="mt-2 max-w-md text-[24px] font-light leading-[1.2] tracking-[-0.015em] text-paper">
            {persona.name}&apos;s line of the books, and nothing else.
          </p>
          <p className="mt-3 max-w-md text-[13px] leading-relaxed text-pewter">
            No other lender&apos;s holding or payment, no register, no DQ list.
            {view.rate_bps === null ? "" : ` Interest is ${showRate(view.rate_bps)} all-in, ACT/360.`} A proof hands one fact to an outsider, who
            checks it against the chain and sees no other.
          </p>
        </div>
      </div>
    </Lit>
  );
}

function TurnedDown() {
  return (
    <Lit tone="stop">
      <Steps steps={BUYING} at={3} />
      <div className="p-6">
        <Tag tone="stop">Not settled</Tag>
        <p className="mt-3 text-[44px] font-light leading-[1.05] tracking-[-0.025em] text-paper">Nothing moved.</p>
        <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-smoke">
          The trade did not settle, and this desk is told no more than that. The reason is in the agent&apos;s envelope alone.
        </p>
      </div>
    </Lit>
  );
}

function BuyIn({ persona, cash }: { persona: Persona; cash: bigint }) {
  return (
    <Lit>
      <Steps steps={BUYING} at={cash > 0n ? 1 : 0} />
      <div className={SPLIT}>
        <div className="space-y-4 p-6">
          {cash > 0n ? (
            <>
              <LitTitle title="Waiting for an offer" />
              <Figure label="Cash in the books (USDC)">{formatCents(cash)}</Figure>
              <Next>A lender offers part of its position from its own desk: Alder is key 3.</Next>
            </>
          ) : (
            <>
              <LitTitle title="Buy into the loan" />
              <ActionForm action={act.depositCash} label="Pay in" hidden={{ persona: persona.id }} className="space-y-4">
                <Field label="Pay in (USDC)">
                  <input name="amount" defaultValue={formatCents(BUY_IN)} inputMode="decimal" className="field field-figure" required />
                </Field>
              </ActionForm>
            </>
          )}
        </div>
        <div className={PANE}>
          <p className="text-[12.5px] text-pewter">How buying in works</p>
          <p className="mt-2 max-w-md text-[24px] font-light leading-[1.2] tracking-[-0.015em] text-paper">Cash against loan, in one step.</p>
          <p className="mt-3 max-w-md text-[13px] leading-relaxed text-pewter">
            Pay cash in, a lender offers you part of its position, you accept, and the agent settles. Paying in is a token transfer, so the chain
            shows the amount. What it buys stays sealed.
          </p>
        </div>
      </div>
    </Lit>
  );
}

function Payments({ persona, view }: { persona: Persona; view: PartyView }) {
  return (
    <Panel title="Your payments" aside="Other lenders' payments are not in this envelope">
      <TableScroll>
        <table className="table-data">
          <thead>
            <tr>
              <th>Payment</th>
              <th className="text-right">Due</th>
              <th className="text-right">Paid</th>
              <th>Status</th>
              <th aria-hidden />
            </tr>
          </thead>
          <tbody>
            {view.payments
              .map((payment, index) => ({ payment, index }))
              .reverse()
              .map(({ payment, index }) => (
                <tr key={payment.request_id}>
                  <td className="text-paper">Interest to {formatDate(payment.period_end)}</td>
                  <td className="fig text-right text-ash">{showCents(payment.due)}</td>
                  <td className="fig text-right text-paper">{payment.paid === null ? "" : showCents(payment.paid)}</td>
                  <td>{payment.status === "settled" ? <Tag tone="ok">Paid</Tag> : <Tag tone="wait">Requested</Tag>}</td>
                  <td>
                    <div className="flex justify-end">
                      {payment.status === "settled" ? <Prove persona={persona.id} item={`payments.${index}`} /> : null}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </TableScroll>
    </Panel>
  );
}

function Cash({ persona, cash }: { persona: Persona; cash: bigint }) {
  const takeOut = cash < ROUND_WITHDRAWAL ? cash : ROUND_WITHDRAWAL;
  return (
    <Panel title="Cash" aside="Token transfers: the chain shows these amounts">
      {cash > 0n ? (
        <ActionForm action={act.withdraw} label="Withdraw" variant="ghost" hidden={{ persona: persona.id }} className={INLINE} buttonClassName="h-11 px-5">
          <Field label="Withdraw to your NEAR account (USDC)">
            <input name="amount" defaultValue={formatCents(takeOut)} inputMode="decimal" className="field fig text-right" required />
          </Field>
        </ActionForm>
      ) : null}
      <ActionForm action={act.depositCash} label="Pay in" variant="ghost" hidden={{ persona: persona.id }} className={INLINE} buttonClassName="h-11 px-5">
        <Field label="Pay in from your NEAR account (USDC)">
          <input name="amount" defaultValue={formatCents(BUY_IN)} inputMode="decimal" className="field fig text-right" required />
        </Field>
      </ActionForm>
    </Panel>
  );
}

function Sell({ persona, view, principal }: { persona: Persona; view: PartyView; principal: bigint }) {
  const buyers = LENDERS.filter((lender) => lender.id !== persona.id);
  const from = view.period?.start ?? view.paid_through;
  const to = view.period?.end ?? view.facility.maturity;
  return (
    <Panel
      title="Sell part of your position"
      aside={<Tag tone="private">Sealed</Tag>}
      note={`The buyer, the size and the price go to the enclave sealed: the chain shows that an offer was made, and nothing about it. You keep the interest earned up to the trade date.${
        view.period ? "" : " The agent has not fixed a rate for the next period, so a trade cannot settle yet."
      }`}
    >
      <ActionForm action={act.offerTrade} label="Offer trade" variant="ghost" hidden={{ persona: persona.id }} className="space-y-3" buttonClassName="h-11 w-full">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Buyer">
            <select name="buyer" className="field" defaultValue={buyers.find((buyer) => buyer.seat === "buyer")?.id}>
              {buyers.map((buyer) => (
                <option key={buyer.id} value={buyer.id}>
                  {buyer.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Trade date">
            <input name="date" type="date" defaultValue={clampDate(addDays(from, 30), from, to)} min={from} max={to} className="field" required />
          </Field>
          <Field label="Par amount (USDC)">
            <input name="amount" inputMode="decimal" defaultValue={formatCents(principal < TRADE_SIZE ? principal : TRADE_SIZE)} className="field fig text-right" required />
          </Field>
          <Field label="Price (% of par)">
            <input name="price" inputMode="decimal" defaultValue="99.50" className="field fig text-right" required />
          </Field>
        </div>
      </ActionForm>
    </Panel>
  );
}
