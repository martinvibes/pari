// SPDX-License-Identifier: Apache-2.0

import { Party } from "@/components/app/party";
import { PageHeader, Panel, TableScroll, Tag } from "@/components/app/ui";
import { Explore, NearUnavailable, plural, registerRows, seatOf, short } from "@/components/near/parts";
import { transactionsOf } from "@/lib/near/activity";
import type { BooksView, PublicRecord, PublicState } from "@/lib/near/books";
import { CHECKS } from "@/lib/near/checks";
import { accountUrl, NEAR, txUrl, UNITS_PER_CENT } from "@/lib/near/config";
import { cents, showCents, showRate } from "@/lib/near/money";
import { isUnavailable, nameOf, viewAll, type Opened, type Sealed } from "@/lib/near/session";
import { formatDate } from "@/lib/pari/dates";
import { formatCents } from "@/lib/pari/money";
import { PERSONAS, SEATS } from "@/lib/pari/personas";

const IRIS = "#A78BFA";

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

const ACTIONS: Record<string, string> = {
  enclave_key: "Enclave key published",
  init_deal: "Deal loaded, sealed",
  register_view_key: "View key registered",
  fix_rate: "Rate fixed",
  request_interest: "Interest requested",
  deposit: "Paid in",
  settle: "Payment settled",
  set_dq: "DQ list set, sealed",
  offer_trade: "Trade offered, sealed",
  accept_trade: "Trade accepted",
  settle_trade: "Trade settlement",
  withdraw: "Withdrawal",
};

/** What a line of the record tells the public, in words. */
function told(line: PublicRecord): string {
  if (!line.ok) return line.detail;
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(line.detail) as Record<string, unknown>;
  } catch {
    return line.detail;
  }
  const money = (key: string) => showCents(String(d[key] ?? "0"));
  switch (line.action) {
    case "fix_rate":
      return `All-in ${showRate(Number(d.rate_bps))} to ${formatDate(String(d.period_end))}`;
    case "request_interest":
      return `Request ${d.request_id}: one total, ${money("total")}`;
    case "deposit":
      return cents(String(d.funded ?? "0")) > 0n ? `${money("funded")} towards a request` : `${money("cash")} as cash`;
    case "settle":
      return `Request ${d.request_id}: ${money("credited")} credited to the lenders, as one figure`;
    case "withdraw":
      return `${money("amount")} paid out`;
    case "settle_trade":
      return `Trade ${d.trade_id} ${d.settled ? "settled" : "not settled"}. No size, no price, no reason`;
    case "offer_trade":
    case "accept_trade":
      return `Trade ${d.trade_id}. No size, no price`;
    case "set_dq":
      return "Ciphertext only";
    default:
      return "";
  }
}

export async function VisibilityScreen() {
  const all = await viewAll();
  if (isUnavailable(all)) return <NearUnavailable problem={all} />;
  const { chain, record, sealed, seen } = all;
  const hashes = transactionsOf(chain.deal_id);
  const viewOf = new Map(seen?.map((opened) => [opened.persona.id, opened.view]));

  return (
    <div className="space-y-12">
      <PageHeader
        kicker="Privacy"
        title="Who sees what"
        accent={IRIS}
        lede="The first column is the public chain: what anyone can read from NEAR with no key. Every other column is one party's envelope, opened with that party's own key. The app filters nothing: a column shows what its key opens."
      />

      {seen ? null : (
        <Panel
          title="You are reading as the public"
          note="This server holds no party's key, so nothing on this page was opened. The chain's facts, one total per request, the record of actions and eight sealed envelopes are all that anyone without a key can read."
          aside={<Tag tone="private">No keys</Tag>}
        >
          <p className="max-w-prose text-[15px] leading-relaxed text-pewter">
            Each party&apos;s key stays with that party. The demo&apos;s keys are made by <span className="font-mono text-smoke">npm run setup</span> in{" "}
            <span className="font-mono text-smoke">near/scripts</span>; with them on this machine, every column below opens.
          </p>
        </Panel>
      )}

      <Panel
        title="What each reader has"
        note="Counts of what is readable, refreshed on every load. Every party can also read the public chain."
      >
        <TableScroll>
          <table className="table-data">
            <thead>
              <tr>
                <th aria-hidden />
                <th aria-hidden />
                {SEATS.map(({ seat, label }) => {
                  const members = PERSONAS.filter((p) => p.seat === seat);
                  const named = members.some((p) => p.name !== label);
                  return (
                    <th key={seat} colSpan={members.length} className="!pb-2 text-center">
                      {named ? (
                        <span className="block border-b border-white/15 pb-1.5 text-[10px] tracking-[0.18em] text-graphite">{label}</span>
                      ) : null}
                    </th>
                  );
                })}
              </tr>
              <tr>
                <th>In the books</th>
                <th className="text-right">
                  <span className="text-iris">Public chain</span>
                </th>
                {sealed.map(({ persona }) => (
                  <th key={persona.id} className="text-right">
                    <Party name={persona.name} className="text-paper" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label}>
                  <td>
                    {row.label}
                    <span className="mt-0.5 block text-xs text-ash">{row.note}</span>
                  </td>
                  <Count n={row.onChain(chain, record)} className="bg-iris/[0.05]" />
                  {sealed.map(({ persona }) => {
                    const view = viewOf.get(persona.id);
                    return view ? (
                      <Count key={persona.id} n={row.opened(view)} />
                    ) : (
                      <td key={persona.id} className="text-right text-xs text-ash">
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

      <PublicChain chain={chain} record={record} sealed={sealed} hashes={hashes} />

      <Panel
        title="Opened with each party's own key"
        note="The same bytes as above, after each party opens its own. A lender's envelope has that lender's line; the register is in three envelopes only."
      >
        {seen ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {seen.map((opened) => (
              <OpenedCard key={opened.persona.id} opened={opened} />
            ))}
          </div>
        ) : (
          <p className="text-[15px] text-pewter">No key on this server opens an envelope, so there is nothing to show here.</p>
        )}
      </Panel>

      <Panel
        title="Checked live"
        note="Each claim is evaluated against the chain and the opened envelopes on every load, and is also a Rust test. The leak test (npm run prove:privacy) searches every transaction as well."
      >
        <ul>
          {CHECKS.map((check) => (
            <li key={check.claim} className="flex flex-col gap-2 border-t border-white/10 py-4 sm:flex-row sm:items-center sm:justify-between">
              <span>
                <span className="text-paper">{check.claim}</span>
                <span className="mt-0.5 block font-mono text-xs text-ash">{check.test}</span>
              </span>
              {!seen ? <Tag tone="private">Needs the keys</Tag> : check.holds({ chain, record, seen }) ? <Tag tone="ok">Holds</Tag> : <Tag tone="stop">Broken</Tag>}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function Count({ n, className = "" }: { n: number; className?: string }) {
  return <td className={`text-right text-base ${n === 0 ? "text-ash" : "text-paper"} ${className}`}>{n === 0 ? "—" : n}</td>;
}

function PublicChain({ chain, record, sealed, hashes }: { chain: PublicState; record: PublicRecord[]; sealed: Sealed[]; hashes: Record<string, string> }) {
  const requests = Object.entries(chain.requests);
  return (
    <Panel
      title="The public chain"
      note="Everything the rules contract stores and every action it has run. Anyone can read this from NEAR; nothing here needs a key."
      aside={<Explore href={accountUrl(NEAR.ledger)}>{NEAR.ledger}</Explore>}
    >
      <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Facility">{chain.terms.name}</Fact>
        <Fact label="Agent and borrower">
          {nameOf(chain.agent)}, {nameOf(chain.borrower)}
        </Fact>
        <Fact label="Books fingerprint">
          <span className="font-mono text-[13px]">{short(chain.root)}</span>
        </Fact>
        <Fact label="Held for the deal (USDC)">{formatCents(BigInt(chain.held) / UNITS_PER_CENT)}</Fact>
        <Fact label="Enclave program">{chain.project_id}</Fact>
        <Fact label="The one build it runs">
          <span className="font-mono text-[13px]">{short(chain.version_key)}</span>
        </Fact>
        <Fact label="Actions run">{chain.seq}</Fact>
        <Fact label="Status">{chain.frozen ? `Frozen: ${chain.frozen}` : "No money rule broken"}</Fact>
      </dl>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="label-data">Interest requests: totals only</p>
          {requests.length === 0 ? (
            <p className="text-[15px] text-pewter">None yet.</p>
          ) : (
            <TableScroll>
              <table className="table-data">
                <thead>
                  <tr>
                    <th>Request</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Paid in</th>
                    <th className="text-right">Credited</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map(([id, request]) => (
                    <tr key={id}>
                      <td>{id}</td>
                      <td className="text-right">{showCents(request.total)}</td>
                      <td className="text-right">{showCents(request.funded)}</td>
                      <td className="text-right">{request.settled ? showCents(request.credited) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </div>
        <div className="space-y-3">
          <p className="label-data">Envelopes: one per party, sealed</p>
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
                    <td>
                      <Party name={persona.name} />
                    </td>
                    <td className="font-mono text-[12px] text-pewter">{envelope.sealed.slice(0, 28)}…</td>
                    <td className="text-right text-smoke">{Buffer.from(envelope.sealed, "base64").length.toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>
      </div>

      <div className="space-y-3">
        <p className="label-data">The record: every action and every refusal, newest first</p>
        <TableScroll>
          <table className="table-data">
            <thead>
              <tr>
                <th>#</th>
                <th>Action</th>
                <th>Signed by</th>
                <th>Result</th>
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
                    <td className="text-ash">{index + 1}</td>
                    <td className="whitespace-nowrap">{ACTIONS[line.action] ?? line.action}</td>
                    <td>
                      <Party name={nameOf(line.caller)} />
                    </td>
                    <td>{line.ok ? <Tag tone="ok">Ran</Tag> : <Tag tone="stop">Refused</Tag>}</td>
                    <td className="whitespace-normal">
                      <span className={line.ok ? "text-smoke" : "text-rose"}>{told(line)}</span>
                      {line.ok ? <span className="block break-all font-mono text-[11px] text-ash">{line.detail}</span> : null}
                    </td>
                    <td className="text-right">{hashes[index] ? <Explore href={txUrl(hashes[index]!)}>Explorer</Explore> : null}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </TableScroll>
      </div>
    </Panel>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="label-data">{label}</dt>
      <dd className="mt-1.5 break-words text-[15px] text-paper">{children}</dd>
    </div>
  );
}

function OpenedCard({ opened }: { opened: Opened }) {
  const { persona, view } = opened;
  const facts: Array<[string, string]> =
    view.role === "party"
      ? [
          ["Position", view.position && cents(view.position.principal) > 0n ? showCents(view.position.principal) : "None"],
          ["Paid to it", formatCents(view.payments.reduce((sum, p) => sum + cents(p.paid), 0n))],
          ["Cash", showCents(view.cash)],
          ["Trades", view.trades.length === 0 ? "None" : `${view.trades.length}, its own, with price`],
        ]
      : [
          ["Register", `${plural(registerRows(view).length, "lender")}, ${showCents(view.outstanding)}`],
          ["Payments", view.requests.length === 0 ? "None" : `${plural(view.requests.length, "request")}, every leg`],
          ["Trades", view.trades.length === 0 ? "None" : `${view.trades.length}, ${view.role === "agent" ? "with prices" : "no prices"}`],
          view.role === "borrower"
            ? ["DQ list", plural(view.dq_list?.length ?? 0, "name")]
            : view.role === "agent"
              ? ["Screening", plural(view.trades.filter((t) => t.screening).length, "result")]
              : ["DQ list", "Not in this envelope"],
        ];
  return (
    <div className="panel-subtle space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <Party name={persona.name} className="font-medium text-paper" />
        <span className="text-xs text-ash">{seatOf(persona)}</span>
      </div>
      <dl className="space-y-2">
        {facts.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 border-t border-white/[0.07] pt-2">
            <dt className="label-data">{label}</dt>
            <dd className="text-right text-[14px] tabular-nums text-smoke">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
