// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import * as act from "@/app/(app)/actions";
import { ActionForm } from "@/components/app/ActionForm";
import { LedgerUnavailable } from "@/components/app/LedgerUnavailable";
import { Empty, Field, PageHeader, Panel, Stats, TableScroll, Tag } from "@/components/app/ui";
import { clampDate, formatDate, formatTime, todayIso } from "@/lib/pari/dates";
import { balanceCents, paymentLabel, positionOf, tradeAllocation } from "@/lib/pari/deal";
import { formatCents, formatMoney, formatPrice, toCents, tradeCashCents } from "@/lib/pari/money";
import { LENDERS, personaById, type Persona } from "@/lib/pari/personas";
import { announcedPeriod, isUnavailable, viewAs, type View } from "@/lib/pari/session";
import type * as P from "@/lib/pari/types";

type Params = { params: { id: string } };

function lenderPersona(id: string): Persona {
  const persona = personaById(id);
  if (!persona || persona.role !== "lender") notFound();
  return persona;
}

export function generateMetadata({ params }: Params): Metadata {
  return { title: personaById(params.id)?.name ?? "Lender" };
}

export default async function LenderPage({ params }: Params) {
  const persona = lenderPersona(params.id);
  const view = await viewAs(persona);
  if (isUnavailable(view)) return <LedgerUnavailable problem={view} />;

  const { s, party } = view;
  const position = positionOf(s, party);
  const usd = { admin: view.cast.registry, id: "USD" };
  const received = s.receipts
    .filter((r) => r.payload.lender === party)
    .reduce((sum, r) => sum + toCents(r.payload.paid), 0n);
  const election = s.elections.find((e) => e.payload.lender === party);

  return (
    <div className="space-y-12">
      <PageHeader
        kicker={persona.blurb}
        title={persona.name}
        lede={`Your position, your payments and your trades. Canton shows ${persona.name} only what ${persona.name} is party to: no other lender's holding, no register, no DQ list.`}
      />

      <Stats
        items={[
          { label: "Principal (USD)", value: position ? formatMoney(position.payload.principal) : "None" },
          { label: "Cash (USD)", value: formatCents(balanceCents(s, party, usd)) },
          { label: "Received (USD)", value: formatCents(received) },
          {
            label: "Information side",
            value: election ? (election.payload.side === "PrivateSide" ? "Private" : "Public") : "None",
          },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <Sell view={view} persona={persona} position={position?.payload ?? null} />
        <Receipts view={view} />
      </div>

      <Trades view={view} persona={persona} />

      <Wall view={view} persona={persona} election={election?.payload ?? null} />
    </div>
  );
}

async function Sell({
  view,
  persona,
  position,
}: {
  view: View;
  persona: Persona;
  position: P.Position | null;
}) {
  if (!position) {
    return (
      <Panel title="Sell" note="Sell part or all of your position to another lender." className="lg:col-span-5">
        <Empty>No position to sell. Buy in by accepting an offer from an existing lender.</Empty>
      </Panel>
    );
  }
  const period = await announcedPeriod(view.cast);
  const today = todayIso();
  const tradeDate = period ? clampDate(today, period.start, period.end) : today;
  const held = toCents(position.principal);
  const defaultAmount = held < 1_000_000_000n ? held : 1_000_000_000n;

  return (
    <Panel
      title="Sell"
      note="The offer goes to the buyer alone. The agent screens the buyer against the borrower's DQ list, then settles delivery-versus-payment. Interest splits on the trade date: you keep what you earned until then."
      className="lg:col-span-5"
    >
      <ActionForm
        action={act.offerTrade}
        label="Offer trade"
        hidden={{ persona: persona.id }}
        className="space-y-5"
      >
        <Field label="Buyer">
          <select name="buyer" className="field bg-carbon" defaultValue={LENDERS.find((l) => l.id !== persona.id)?.id}>
            {LENDERS.filter((l) => l.id !== persona.id).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Par amount (USD)">
            <input name="amount" inputMode="decimal" defaultValue={formatCents(defaultAmount)} className="field" required />
          </Field>
          <Field label="Price (% of par)">
            <input name="price" inputMode="decimal" defaultValue="99.50" className="field" required />
          </Field>
        </div>
        <Field label="Trade date">
          <input
            name="date"
            type="date"
            defaultValue={tradeDate}
            min={period?.start}
            max={period?.end}
            className="field"
            required
          />
        </Field>
      </ActionForm>
    </Panel>
  );
}

function Receipts({ view }: { view: View }) {
  const receipts = [...view.s.receipts].sort((a, b) => (a.payload.paidAt < b.payload.paidAt ? 1 : -1));
  return (
    <Panel
      title="Payments received"
      note="Each one settled in the same transaction as every other lender's, from an allocation the borrower funded. You see your own leg only."
      className="lg:col-span-7"
    >
      {receipts.length === 0 ? (
        <Empty>No payments received yet.</Empty>
      ) : (
        <TableScroll>
          <table className="table-data">
            <thead>
              <tr>
                <th>Paid</th>
                <th>Payment</th>
                <th className="text-right">Due</th>
                <th className="text-right">Paid (USD)</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.contractId}>
                  <td className="whitespace-nowrap text-smoke">{formatTime(r.payload.paidAt)}</td>
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

function Trades({ view, persona }: { view: View; persona: Persona }) {
  const { s, party, name } = view;
  const offers = s.offers.filter((o) => o.payload.seller === party || o.payload.buyer === party);
  const tickets = s.tickets.filter((t) => t.payload.seller === party || t.payload.buyer === party);
  const empty = offers.length === 0 && tickets.length === 0;

  return (
    <Panel
      title="Trades"
      note="Offers and agreed trades you are a party to. Only the two counterparties and the agent ever see a price."
    >
      {empty ? (
        <Empty>No open offers or trades.</Empty>
      ) : (
        <TableScroll>
          <table className="table-data">
            <thead>
              <tr>
                <th>Trade</th>
                <th className="text-right">Par</th>
                <th className="text-right">Price</th>
                <th className="text-right">Cash</th>
                <th>Trade date</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((offer) => {
                const o = offer.payload;
                const buying = o.buyer === party;
                return (
                  <tr key={offer.contractId}>
                    <td className="whitespace-nowrap">{buying ? `Buy from ${name(o.seller)}` : `Sell to ${name(o.buyer)}`}</td>
                    <td className="text-right">{formatMoney(o.amount)}</td>
                    <td className="text-right">{formatPrice(o.price)}</td>
                    <td className="text-right">{formatCents(tradeCashCents(o.amount, o.price))}</td>
                    <td className="whitespace-nowrap text-smoke">{formatDate(o.tradeDate)}</td>
                    <td>
                      <Tag tone="signal">{buying ? "Offer to you" : "Offered"}</Tag>
                    </td>
                    <td>
                      <div className="flex justify-end gap-2">
                        {buying ? (
                          <>
                            <ActionForm
                              action={act.acceptTrade}
                              label="Accept and fund"
                              variant="ghost"
                              hidden={{ persona: persona.id, offer: offer.contractId }}
                            />
                            <ActionForm
                              action={act.rejectTrade}
                              label="Reject"
                              variant="ghost"
                              hidden={{ persona: persona.id, offer: offer.contractId }}
                            />
                          </>
                        ) : (
                          <ActionForm
                            action={act.withdrawOffer}
                            label="Withdraw"
                            variant="ghost"
                            hidden={{ persona: persona.id, offer: offer.contractId }}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {tickets.map((ticket) => {
                const t = ticket.payload;
                const buying = t.buyer === party;
                const funded = buying && tradeAllocation(s, t) !== undefined;
                return (
                  <tr key={ticket.contractId}>
                    <td className="whitespace-nowrap">{buying ? `Buy from ${name(t.seller)}` : `Sell to ${name(t.buyer)}`}</td>
                    <td className="text-right">{formatMoney(t.amount)}</td>
                    <td className="text-right">{formatPrice(t.price)}</td>
                    <td className="text-right">{formatMoney(t.cash)}</td>
                    <td className="whitespace-nowrap text-smoke">{formatDate(t.tradeDate)}</td>
                    <td>
                      <Tag tone="paper">{funded ? "Funded" : "Agreed"}</Tag>
                    </td>
                    <td className="text-right text-xs text-ash">With the agent to settle</td>
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

function Wall({ view, persona, election }: { view: View; persona: Persona; election: P.InfoElection | null }) {
  const { s, party } = view;
  const received = s.accesses.filter((a) => a.payload.lender === party);
  const privateSide = election?.side === "PrivateSide";

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <Panel
        title="Information wall"
        note="Private side receives material non-public information and is restricted from trading the borrower's public securities. Only you can move yourself over the wall."
        className="lg:col-span-5"
      >
        <p className="text-sm text-smoke">
          {election
            ? privateSide
              ? `${persona.name} is private side: MNPI can reach it.`
              : `${persona.name} is public side: no MNPI can reach it.`
            : `${persona.name} has no election on file, so it receives no documents.`}
        </p>
        <ActionForm
          action={act.setSide}
          label={privateSide ? "Return to public side" : "Elect private side"}
          hidden={{ persona: persona.id, side: privateSide ? "PublicSide" : "PrivateSide" }}
        />
        {election ? null : (
          <div className="flex justify-end">
            <ActionForm
              action={act.setSide}
              label="Elect public side"
              variant="ghost"
              hidden={{ persona: persona.id, side: "PublicSide" }}
            />
          </div>
        )}
      </Panel>

      <Panel
        title="Documents received"
        note="Distributed by the agent from the borrower's data room. Each carries the document's hash, so you can verify what you were sent."
        className="lg:col-span-7"
      >
        {received.length === 0 ? (
          <Empty>No documents received.</Empty>
        ) : (
          <TableScroll>
            <table className="table-data">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {received.map((a) => (
                  <tr key={a.contractId}>
                    <td className="min-w-[16rem] whitespace-normal">
                      <span className="flex items-center gap-3">
                        {a.payload.title}
                        {a.payload.mnpi ? <Tag tone="paper">MNPI</Tag> : null}
                      </span>
                    </td>
                    <td className="font-mono text-xs text-smoke">
                      {a.payload.sha256.slice(0, 8)}…{a.payload.sha256.slice(-4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>
    </div>
  );
}
