// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import { Lit, Screen } from "@/components/app/Screen";
import { Party } from "@/components/app/party";
import { Panel, TableScroll, Tag, type Tone } from "@/components/app/ui";
import type { DealView, Entry, Request, Trade } from "@/lib/near/books";
import { cents, interestDue, showCents, showPrice } from "@/lib/near/money";
import { nameOf, type Unavailable } from "@/lib/near/session";
import { formatDate } from "@/lib/pari/dates";
import { formatCents, formatShare } from "@/lib/pari/money";
import type { Persona } from "@/lib/pari/personas";

// Pieces the NEAR desks share: the register, payments, trades, and the
// interest cycle every desk follows.

/** Shown instead of a screen when the chain, the deal or the demo keys are missing. */
export function NearUnavailable({ problem }: { problem: Unavailable }) {
  const title = { chain: "Chain unreachable", deal: "No deal yet", keys: "No keys on this server" }[problem.unavailable];
  return (
    <Screen title={title} context="NEAR testnet">
      <Lit className="space-y-4 p-6">
        <p className="max-w-2xl text-[14px] leading-relaxed text-smoke">
          The app reads the rules contract on NEAR testnet and opens each party&apos;s envelope with that party&apos;s key. Set the deal up once,
          then reload.
        </p>
        {problem.unavailable === "keys" ? (
          <p className="text-[14px] leading-relaxed text-pewter">
            What the public can read needs no key:{" "}
            <Link href="/visibility" className="text-paper underline underline-offset-4">
              open Who sees what
            </Link>
            .
          </p>
        ) : null}
        <pre className="overflow-x-auto border border-white/[0.08] bg-ink p-4 font-mono text-[12.5px] leading-6 text-smoke">
          {`cd near && ./build.sh                # the contracts and the enclave program
cd scripts && npm install
npm run setup                        # accounts, contracts and the sealed deal
cd ../../web && PARI_BACKEND=near npm run dev`}
        </pre>
        <p className="text-[12.5px] leading-relaxed text-ash">{problem.detail}</p>
      </Lit>
    </Screen>
  );
}

/** "the agent's", "Alder's". */
export function whose(persona: Persona): string {
  return persona.role === "lender" || persona.role === "borrower" ? `${persona.name}'s` : `the ${persona.name.toLowerCase()}'s`;
}

/** "1 request", "2 requests". */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** A party's seat in one line. The Canton build's public and private sides are not part of the NEAR build. */
export function seatOf(persona: Persona): string {
  return persona.seat === "lender" ? "Lender" : persona.blurb;
}

export function short(hash: string | null): string {
  return hash ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : "none yet";
}

/** A link out to the public explorer. */
export function Explore({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-sky underline decoration-sky/40 underline-offset-4 transition hover:text-paper">
      {children}
    </a>
  );
}

/** The interest cycle, as every desk names it. */
export const CYCLE = ["Fix rate", "Request interest", "Borrower pays", "Settle"];

/** Where the deal stands in that cycle. */
export function cycleAt(view: DealView): number {
  const open = view.requests.find((r) => r.status === "open");
  if (open) return cents(open.funded) > 0n ? 3 : 2;
  return view.period ? 1 : 0;
}

/** The title row of the one lit card on a desk. */
export function LitTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h2 className="text-[17px] font-medium leading-6 text-paper">{title}</h2>
      {children}
    </div>
  );
}

/** A figure as a desk's headline: the amount this screen is about. */
export function Figure({ label, children, note }: { label: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[12.5px] text-pewter">{label}</p>
      <p className="fig mt-1 text-[34px] leading-10 text-paper">{children}</p>
      {note ? <p className="mt-1 text-[12.5px] leading-relaxed text-ash">{note}</p> : null}
    </div>
  );
}

/** Who acts next, when it is not this desk. */
export function Next({ children }: { children: React.ReactNode }) {
  return <p className="text-[12.5px] leading-relaxed text-ash">{children}</p>;
}

const TRADE_TAG: Record<Trade["status"], { tone: Tone; text: string }> = {
  offered: { tone: "wait", text: "Offered" },
  accepted: { tone: "info", text: "Ready to settle" },
  settled: { tone: "ok", text: "Settled" },
  not_settled: { tone: "stop", text: "Not settled" },
};

export function TradeStatus({ trade }: { trade: Trade }) {
  const { tone, text } = TRADE_TAG[trade.status];
  return <Tag tone={tone}>{text}</Tag>;
}

/** A trade's two sides, by name. */
export function Sides({ trade }: { trade: Trade }) {
  return (
    <span className="whitespace-nowrap">
      <Party name={nameOf(trade.seller)} /> <span className="px-1 text-ash">→</span> <Party name={nameOf(trade.buyer)} />
    </span>
  );
}

/** Trades as one table: who, how much, where it stands. Price and cash only
 *  where the envelope holds them; `act` is the one thing this desk can do. */
export function TradesTable({
  trades,
  prices,
  under,
  act,
}: {
  trades: Trade[];
  prices: boolean;
  /** A second line under a trade's status, e.g. the agent's screening result. */
  under?: (trade: Trade) => React.ReactNode;
  act?: (trade: Trade) => React.ReactNode;
}) {
  return (
    <TableScroll>
      <table className="table-data">
        <thead>
          <tr>
            <th>Trade</th>
            <th className="text-right">Par</th>
            {prices ? <th className="text-right">Price</th> : null}
            {prices ? <th className="text-right">Cash</th> : null}
            {act ? <th aria-hidden /> : null}
          </tr>
        </thead>
        <tbody>
          {[...trades].reverse().map((trade) => (
            <tr key={trade.id}>
              <td>
                <Sides trade={trade} />
                <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-ash">
                  <TradeStatus trade={trade} />
                  <span aria-hidden>·</span>
                  {formatDate(trade.trade_date)}
                </div>
                {under?.(trade)}
              </td>
              <td className="fig text-right text-paper">{showCents(trade.par)}</td>
              {prices ? <td className="fig text-right">{trade.price_ppm === undefined ? "" : showPrice(trade.price_ppm)}</td> : null}
              {prices ? <td className="fig text-right">{showCents(trade.cash)}</td> : null}
              {act ? (
                <td>
                  <div className="flex justify-end">{act(trade)}</div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

/** The register lines, largest first. */
export function registerRows(view: DealView): Array<[string, Entry]> {
  return Object.entries(view.register)
    .filter(([, entry]) => cents(entry.principal) > 0n || cents(entry.carried) > 0n)
    .sort(([, a], [, b]) => Number(cents(b.principal) - cents(a.principal)));
}

/** Interest every lender is owed at the end of the current period, summed. */
export function totalDue(view: DealView): bigint {
  const { period, rate_bps } = view;
  if (!period || rate_bps === null) return 0n;
  return registerRows(view).reduce((sum, [, entry]) => sum + interestDue(entry, rate_bps, period.end), 0n);
}

/** Every lender's principal and interest, as the agent, the borrower and the auditor see it. */
export function Register({ view, aside, className = "" }: { view: DealView; aside: string; className?: string }) {
  const { period, rate_bps } = view;
  const outstanding = cents(view.outstanding);
  const rows = registerRows(view);
  const due = (entry: Entry) => (period && rate_bps !== null ? interestDue(entry, rate_bps, period.end) : cents(entry.carried));
  return (
    <Panel title="Register" aside={aside} className={className}>
      <TableScroll>
        <table className="table-data">
          <thead>
            <tr>
              <th>Lender</th>
              <th className="text-right">Principal</th>
              <th className="text-right">Share</th>
              <th className="text-right">{period ? "Due at period end" : "Interest carried"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([lender, entry]) => (
              <tr key={lender}>
                <td className="text-paper">
                  <Party name={nameOf(lender)} />
                </td>
                <td className="fig text-right text-paper">{showCents(entry.principal)}</td>
                <td className="fig text-right text-ash">{formatShare(cents(entry.principal), outstanding)}</td>
                <td className="fig text-right">{formatCents(due(entry))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="!border-b-0 text-ash">{plural(rows.length, "lender")}</td>
              <td className="fig !border-b-0 text-right text-paper">{formatCents(outstanding)}</td>
              <td className="!border-b-0" />
              <td className="fig !border-b-0 text-right text-paper">{formatCents(rows.reduce((sum, [, entry]) => sum + due(entry), 0n))}</td>
            </tr>
          </tfoot>
        </table>
      </TableScroll>
    </Panel>
  );
}

/** Every settled payment, one line per lender. Absent until there is one. */
export function PaymentsMade({ requests, aside }: { requests: Request[]; aside: string }) {
  const settled = requests.filter((r) => r.status === "settled").reverse();
  if (settled.length === 0) return null;
  return (
    <Panel title="Payments made" aside={aside}>
      <TableScroll>
        <table className="table-data">
          <thead>
            <tr>
              <th>Payment</th>
              <th>Lender</th>
              <th className="text-right">Due</th>
              <th className="text-right">Paid</th>
            </tr>
          </thead>
          <tbody>
            {settled.flatMap((request) =>
              Object.entries(request.legs)
                .sort(([, a], [, b]) => Number(cents(b) - cents(a)))
                .map(([lender, due]) => (
                  <tr key={`${request.id}-${lender}`}>
                    <td>Interest to {formatDate(request.period_end)}</td>
                    <td className="text-paper">
                      <Party name={nameOf(lender)} />
                    </td>
                    <td className="fig text-right text-ash">{showCents(due)}</td>
                    <td className="fig text-right text-paper">{showCents(request.paid[lender])}</td>
                  </tr>
                )),
            )}
          </tbody>
        </table>
      </TableScroll>
    </Panel>
  );
}
