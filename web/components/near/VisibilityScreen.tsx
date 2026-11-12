// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import { Lit, Lock, Screen } from "@/components/app/Screen";
import { Party, PartyDot } from "@/components/app/party";
import { Panel, TableScroll, Tag } from "@/components/app/ui";
import { Explore, NearUnavailable, plural, registerRows, seatOf, short } from "@/components/near/parts";
import { transactionsOf } from "@/lib/near/activity";
import type { BooksView, PublicRecord, PublicState } from "@/lib/near/books";
import { CHECKS } from "@/lib/near/checks";
import { accountUrl, NEAR, txUrl, UNITS_PER_CENT } from "@/lib/near/config";
import { cents, showCents } from "@/lib/near/money";
import { actionOf, told } from "@/lib/near/record";
import { isUnavailable, nameOf, viewAll, type Opened } from "@/lib/near/session";
import { formatCents } from "@/lib/pari/money";

// What is in the books, in one line each, and how much of it each reader has:
// the public chain with no key, and each party with its own.
const ROWS: Array<{ label: string; note: string; onChain: (chain: PublicState, record: PublicRecord[]) => number; opened: (view: BooksView) => number }> = [
  {
    label: "Register lines",
    note: "A lender's principal",
    onChain: () => 0,
    opened: (v) => (v.role === "party" ? (cents(v.position?.principal) > 0n ? 1 : 0) : registerRows(v).length),
  },
  {
    label: "Payment legs",
    note: "What one lender is owed or was paid",
    onChain: () => 0,
    opened: (v) => (v.role === "party" ? v.payments.length : v.requests.reduce((n, r) => n + Object.keys(r.legs).length, 0)),
  },
  {
    label: "Payment totals",
    note: "One figure per request",
    onChain: (chain) => Object.keys(chain.requests).length,
    opened: (v) => (v.role === "party" ? 0 : v.requests.length),
  },
  { label: "Trades", note: "Seller, buyer, size and date", onChain: () => 0, opened: (v) => v.trades.length },
  {
    label: "Trade prices",
    note: "Price and cash paid",
    onChain: () => 0,
    opened: (v) => v.trades.filter((t) => t.price_ppm !== undefined).length,
  },
  { label: "DQ list", note: "Buyers the borrower refuses", onChain: () => 0, opened: (v) => (v.role === "borrower" ? (v.dq_list?.length ?? 0) : 0) },
  {
    label: "Screening results",
    note: "Why a trade did not settle",
    onChain: () => 0,
    opened: (v) => v.trades.filter((t) => t.screening).length,
  },
  {
    label: "Deposits and withdrawals",
    note: "Token transfers, public by design",
    onChain: (_, record) => record.filter((line) => line.ok && (line.action === "deposit" || line.action === "withdraw")).length,
    opened: () => 0,
  },
];

/** The public chain next to each party's own key. `as` picks the reader whose
 *  envelope is opened beside the chain; the default is one lender. */
export async function VisibilityScreen({ as }: { as?: string }) {
  const all = await viewAll();
  if (isUnavailable(all)) return <NearUnavailable problem={all} />;
  const { chain, record, sealed, seen } = all;
  const hashes = transactionsOf(chain.deal_id);
  const viewOf = new Map(seen?.map((opened) => [opened.persona.id, opened.view]));
  const reader = seen?.find((opened) => opened.persona.id === as) ?? seen?.find((opened) => opened.persona.id === "alder") ?? null;

  return (
    <Screen title="Who sees what" context="The public chain with no key, next to what each party's own key opens">
      {seen ? null : (
        <Lit className="space-y-2 p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-[17px] font-medium text-paper">You are reading as the public</h2>
            <Tag tone="private">No keys</Tag>
          </div>
          <p className="max-w-2xl text-[13.5px] leading-relaxed text-pewter">
            This server holds no party&apos;s key, so nothing on this page was opened. The chain&apos;s facts, one total per request, the record of
            actions and the sealed envelopes are all that anyone without a key can read.
          </p>
        </Lit>
      )}

      <Panel title="What each reader has" aside="Counts of what is readable, read live. Pick a reader to open its envelope below.">
        <TableScroll>
          <table className="table-data">
            <thead>
              <tr>
                <th>In the books</th>
                <th className="border-x border-white/[0.08] bg-ink !px-3.5 text-right !text-pewter">Public chain</th>
                {sealed.map(({ persona }) => {
                  const on = reader?.persona.id === persona.id;
                  return (
                    <th key={persona.id} className={`!px-0 text-right ${on ? "bg-white/[0.06]" : ""}`}>
                      {seen ? (
                        <Link
                          href={`/visibility?as=${persona.id}`}
                          scroll={false}
                          aria-current={on ? "true" : undefined}
                          className={`inline-flex items-center gap-2 px-3 transition hover:text-paper ${on ? "font-medium text-paper" : "text-pewter"}`}
                        >
                          <PartyDot name={persona.name} />
                          {persona.name}
                        </Link>
                      ) : (
                        <span className="px-3">{persona.name}</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label}>
                  <td>
                    <span className="text-paper">{row.label}</span>
                    <span className="ml-3 hidden text-[12px] text-ash md:inline">{row.note}</span>
                  </td>
                  <Count n={row.onChain(chain, record)} className="border-x border-white/[0.08] bg-ink !px-3.5" />
                  {sealed.map(({ persona }) => {
                    const view = viewOf.get(persona.id);
                    const on = reader?.persona.id === persona.id;
                    return view ? (
                      <Count key={persona.id} n={row.opened(view)} className={`!px-3 ${on ? "bg-white/[0.06]" : ""}`} />
                    ) : (
                      <td key={persona.id} className="!px-3 text-right text-[12px] text-ash">
                        sealed
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <OnChain chain={chain} />
        {reader ? <OpenedCard opened={reader} /> : null}
      </div>

      <Panel title="The record" aside="Every action and every refusal, newest first">
        <TableScroll>
          <table className="table-data">
            <thead>
              <tr>
                <th>#</th>
                <th>Action</th>
                <th>Signed by</th>
                <th>What the chain was told</th>
                <th className="text-right">Transaction</th>
              </tr>
            </thead>
            <tbody>
              {record
                .map((line, index) => ({ line, index }))
                .reverse()
                .map(({ line, index }) => (
                  <tr key={index}>
                    <td className="fig text-graphite">{index + 1}</td>
                    <td className="text-paper">
                      {actionOf(line)}
                      {line.ok ? null : <span className="ml-2 text-rose">Refused</span>}
                    </td>
                    <td>
                      <Party name={nameOf(line.caller)} />
                    </td>
                    <td className={`max-w-[26rem] !whitespace-normal ${line.ok ? "" : "text-rose"}`}>{told(line)}</td>
                    <td className="text-right">{hashes[index] ? <Explore href={txUrl(hashes[index]!)}>Explorer</Explore> : null}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </TableScroll>
      </Panel>

      <div className="grid gap-x-10 gap-y-6 min-[1760px]:grid-cols-2">
        <Panel title="Sealed envelopes" aside="The cast's eight, as the chain holds them">
          <TableScroll>
            <table className="table-data">
              <thead>
                <tr>
                  <th>For</th>
                  <th>What the chain holds</th>
                  <th className="text-right">Bytes</th>
                </tr>
              </thead>
              <tbody>
                {sealed.map(({ persona, envelope }) => (
                  <tr key={persona.id}>
                    <td className="text-paper">
                      <Party name={persona.name} />
                    </td>
                    <td className="font-mono text-[12px] text-graphite">{envelope.sealed.slice(0, 28)}…</td>
                    <td className="fig text-right">{Buffer.from(envelope.sealed, "base64").length.toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Panel>

        <Panel
          title="Checked live"
          aside="On every load; each is also a Rust test"
          note={
            <>
              Next to each envelope the chain holds a commitment, which lets a party show one fact and no other.{" "}
              <Link href="/verify" className="text-paper underline decoration-white/30 underline-offset-4 transition hover:decoration-paper">
                Check a proof
              </Link>
            </>
          }
        >
          <ul className="border-t border-white/[0.08]">
            {CHECKS.map((check) => (
              <li key={check.claim} className="flex items-start justify-between gap-6 border-b border-white/[0.08] py-2.5">
                <span className="text-[13.5px] leading-snug text-smoke">{check.claim}</span>
                <span className="shrink-0 pt-0.5">
                  {!seen ? <Tag tone="private">Needs the keys</Tag> : check.holds({ chain, record, seen }) ? <Tag tone="ok">Holds</Tag> : <Tag tone="stop">Broken</Tag>}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </Screen>
  );
}

function Count({ n, className = "" }: { n: number; className?: string }) {
  return <td className={`fig text-right ${n === 0 ? "text-graphite" : "text-paper"} ${className}`}>{n === 0 ? "–" : n}</td>;
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-t border-white/[0.08] py-2">
      <dt className="text-pewter">{label}</dt>
      <dd className="fig min-w-0 truncate text-right text-paper">{children}</dd>
    </div>
  );
}

/** Everything anyone can read about the deal, with no key. */
function OnChain({ chain }: { chain: PublicState }) {
  const requests = Object.entries(chain.requests);
  return (
    <section className="border border-white/[0.17] bg-ink p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[17px] font-medium text-paper">The public chain</h2>
        <span className="rounded-pill border border-white/[0.17] px-2.5 text-[11.5px] leading-[18px] text-pewter">no key</span>
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-pewter">
        Everything <Explore href={accountUrl(NEAR.ledger)}>{NEAR.ledger}</Explore> stores. No position, no payment to a lender, no price.
      </p>
      <dl className="mt-4 text-[13.5px]">
        <Line label="Facility">
          <span className="font-sans">{chain.terms.name}</span>
        </Line>
        <Line label="Books fingerprint">{short(chain.root)}</Line>
        <Line label="Actions run">{chain.seq}</Line>
        <Line label="Held for the deal (USDC)">{formatCents(BigInt(chain.held) / UNITS_PER_CENT)}</Line>
        {requests.map(([id, request]) => (
          <Line key={id} label={`Interest request ${id}: one total`}>
            {showCents(request.total)}
            <span className="ml-2 font-sans text-[12px] text-ash">{request.settled ? `${showCents(request.credited)} credited` : `${showCents(request.funded)} paid in`}</span>
          </Line>
        ))}
        <Line label="Sealed envelopes, one per party">{chain.parties.length}</Line>
        <Line label="Enclave build it runs">{short(chain.version_key)}</Line>
        <Line label="Status">
          <span className={`font-sans ${chain.frozen ? "text-rose" : ""}`}>{chain.frozen ? `Frozen: ${chain.frozen}` : "No money rule broken"}</span>
        </Line>
      </dl>
    </section>
  );
}

/** One party's envelope, opened with that party's own key. */
function OpenedCard({ opened }: { opened: Opened }) {
  const { persona, view, envelope } = opened;
  const facts: Array<[string, string]> =
    view.role === "party"
      ? [
          ["Its position", view.position && cents(view.position.principal) > 0n ? showCents(view.position.principal) : "None"],
          ["Interest due to it", showCents(view.interest_due ?? view.position?.carried)],
          ["Paid to it", formatCents(view.payments.reduce((sum, p) => sum + cents(p.paid), 0n))],
          ["Its cash", showCents(view.cash)],
          ["Trades", view.trades.length === 0 ? "None" : `${view.trades.length}, its own, with price`],
          ["Other lenders' lines", "Not in this envelope"],
          ["DQ list", "Not in this envelope"],
        ]
      : [
          ["Register", `${plural(registerRows(view).length, "lender")}, ${showCents(view.outstanding)}`],
          ["Payments", view.requests.length === 0 ? "None" : `${plural(view.requests.length, "request")}, every leg`],
          ["Trades", view.trades.length === 0 ? "None" : `${view.trades.length}, ${view.role === "agent" ? "with prices" : "no prices"}`],
          view.role === "borrower"
            ? ["DQ list", plural(view.dq_list?.length ?? 0, "name")]
            : view.role === "agent"
              ? ["Screening results", String(view.trades.filter((t) => t.screening).length)]
              : ["DQ list", "Not in this envelope"],
          ...(view.role === "agent" ? [] : ([["Trade prices", "Not in this envelope"]] as Array<[string, string]>)),
        ];
  return (
    <Lit className="p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2.5 text-[17px] font-medium text-paper">
          <PartyDot name={persona.name} className="!h-2.5 !w-2.5" />
          {persona.name}&apos;s envelope, opened
        </h2>
        <span className="inline-flex items-center gap-2 text-[12px] text-ash">
          <Lock />
          {persona.name}&apos;s key
        </span>
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-pewter">
        {seatOf(persona)}. The same {Buffer.from(envelope.sealed, "base64").length.toLocaleString("en-US")} bytes the chain holds, after {persona.name} opens
        them.
      </p>
      <dl className="mt-4 text-[13.5px]">
        {facts.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-6 border-t border-white/[0.08] py-2">
            <dt className="text-pewter">{label}</dt>
            <dd className={`min-w-0 text-right ${value === "Not in this envelope" ? "text-graphite" : /^[\d,.]+$/.test(value) ? "fig text-paper" : "text-paper"}`}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-white/[0.08] pt-3 text-[12.5px]">
        <Link href={persona.href} className="text-paper underline decoration-white/30 underline-offset-4 transition hover:decoration-paper">
          Sit at {persona.name}&apos;s desk
        </Link>
      </p>
    </Lit>
  );
}
