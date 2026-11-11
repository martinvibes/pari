// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import { Party } from "@/components/app/party";
import { Facts, PageHeader, Panel, TableScroll, Tag, type Tone } from "@/components/app/ui";
import { Prove } from "@/components/near/Prove";
import type { DealView, Entry, PublicState, Request, Trade } from "@/lib/near/books";
import { accountUrl, NEAR } from "@/lib/near/config";
import { cents, interestDue, showCents } from "@/lib/near/money";
import { nameOf, type Seen, type Unavailable } from "@/lib/near/session";
import { formatDate } from "@/lib/pari/dates";
import { formatCents, formatShare } from "@/lib/pari/money";
import type { Persona } from "@/lib/pari/personas";

// Pieces the NEAR screens share: the deal's facts, the register, payments,
// and the envelope as the chain holds it.

/** Shown instead of a screen when the chain, the deal or the demo keys are missing. */
export function NearUnavailable({ problem }: { problem: Unavailable }) {
  const title = { chain: "Chain unreachable", deal: "No deal yet", keys: "No keys on this server" }[problem.unavailable];
  return (
    <div className="space-y-12">
      <PageHeader
        kicker="NEAR testnet"
        title={title}
        lede="The app reads the rules contract on NEAR testnet and opens each party's envelope with that party's key. Set the deal up once, then reload."
      />
      {problem.unavailable === "keys" ? (
        <p className="max-w-prose text-[15px] leading-relaxed text-pewter">
          What the public can read needs no key:{" "}
          <Link href="/visibility" className="text-paper underline underline-offset-4">
            open Who sees what
          </Link>
          .
        </p>
      ) : null}
      <Panel title="Set the deal up on testnet" note={problem.detail}>
        <pre className="panel-subtle overflow-x-auto p-5 font-mono text-sm leading-7 text-smoke">
          {`cd near && ./build.sh                # the contracts and the enclave program
cd scripts && npm install
npm run setup                        # accounts, contracts and the sealed deal
cd ../../web && PARI_BACKEND=near npm run dev`}
        </pre>
      </Panel>
    </div>
  );
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

/** The facility and where its books stand, under a page title. */
export function DealFacts({ chain }: { chain: PublicState }) {
  return (
    <Facts
      items={[
        { label: "Facility", value: chain.terms.name },
        { label: "Margin", value: `${chain.terms.margin_bps} bp` },
        { label: "Matures", value: formatDate(chain.terms.maturity) },
        { label: "Books", value: `action #${chain.seq}` },
        ...(chain.frozen ? [{ label: "Status", value: "Frozen", tone: "stop" as Tone }] : []),
      ]}
    />
  );
}

/** A link out to the public explorer. */
export function Explore({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-sky underline decoration-sky/40 underline-offset-4 transition hover:text-paper">
      {children}
    </a>
  );
}

/** The party's envelope as the chain holds it: bytes anyone can fetch and
 *  only this party's key can open. Next to it the chain holds a commitment,
 *  which lets the party show one fact from the envelope and nothing else. */
export function Sealed({ seen }: { seen: Seen }) {
  const { envelope, persona, chain, view } = seen;
  const bytes = Buffer.from(envelope.sealed, "base64").length;
  const provable =
    view.role === "party"
      ? [...(view.position ? [{ item: "position", label: "Prove what you hold" }] : []), { item: "cash", label: "Prove your cash" }]
      : [
          { item: "register", label: "Prove the register" },
          { item: "outstanding", label: "Prove the outstanding total" },
        ];
  return (
    <Panel
      title="Your envelope on the chain"
      note={`This screen is ${persona.name}'s envelope, opened with ${persona.name}'s view key. Anyone can fetch the bytes below from the contract; without that key they are noise.`}
      aside={<Tag tone="private">Sealed</Tag>}
    >
      <p className="panel-subtle break-all p-4 font-mono text-[12px] leading-6 text-pewter">{envelope.sealed.slice(0, 280)}…</p>
      <p className="text-[13px] leading-relaxed text-ash">
        {bytes.toLocaleString("en-US")} bytes, written after action #{envelope.seq} to{" "}
        <Explore href={accountUrl(NEAR.ledger)}>{NEAR.ledger}</Explore>. The books&apos; fingerprint on the chain is{" "}
        <span className="font-mono text-smoke">{short(chain.root)}</span>.
      </p>
      {envelope.commitment ? (
        <div className="space-y-3 border-t border-white/10 pt-6">
          <p className="label-data">Show one fact, and nothing else</p>
          <p className="max-w-prose text-[13px] leading-relaxed text-pewter">
            Next to the envelope the chain holds a commitment, <span className="font-mono text-smoke">{short(envelope.commitment)}</span>: the
            enclave&apos;s hash over every fact inside. With it {persona.name} can hand one fact to an outsider, a bank or a regulator, who
            checks it against NEAR with no key and learns nothing else.
          </p>
          <div className="flex flex-wrap gap-2">
            {provable.map(({ item, label }) => (
              <Prove key={item} persona={persona.id} item={item} label={label} />
            ))}
            <Link href="/verify" className="btn-ghost border-transparent text-pewter hover:border-transparent hover:text-paper">
              Check a proof
            </Link>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

const TRADE_TAG: Record<Trade["status"], { tone: Tone; text: string }> = {
  offered: { tone: "wait", text: "Offered" },
  accepted: { tone: "info", text: "Accepted" },
  settled: { tone: "ok", text: "Settled" },
  not_settled: { tone: "stop", text: "Not settled" },
};

export function TradeStatus({ trade }: { trade: Trade }) {
  const { tone, text } = TRADE_TAG[trade.status];
  return <Tag tone={tone}>{text}</Tag>;
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
export function Register({ view, note, className = "" }: { view: DealView; note: string; className?: string }) {
  const { period, rate_bps } = view;
  const outstanding = cents(view.outstanding);
  return (
    <Panel title="Register" note={note} className={className}>
      <TableScroll>
        <table className="table-data">
          <thead>
            <tr>
              <th>Lender</th>
              <th className="text-right">Principal</th>
              <th className="text-right">Share</th>
              <th>Accrues from</th>
              <th className="text-right">{period ? "Due at period end" : "Interest carried"}</th>
            </tr>
          </thead>
          <tbody>
            {registerRows(view).map(([lender, entry]) => (
              <tr key={lender}>
                <td>
                  <Party name={nameOf(lender)} />
                </td>
                <td className="text-right">{showCents(entry.principal)}</td>
                <td className="text-right text-smoke">{formatShare(cents(entry.principal), outstanding)}</td>
                <td className="text-smoke">{formatDate(entry.accrual_start)}</td>
                <td className="text-right">
                  {period && rate_bps !== null ? formatCents(interestDue(entry, rate_bps, period.end)) : showCents(entry.carried)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </Panel>
  );
}

/** Every settled payment, one line per lender. */
export function PaymentsMade({ requests, note }: { requests: Request[]; note: string }) {
  const settled = requests.filter((r) => r.status === "settled").reverse();
  return (
    <Panel title="Payments made" note={note}>
      {settled.length === 0 ? (
        <p className="text-[15px] text-pewter">No payments yet.</p>
      ) : (
        <TableScroll>
          <table className="table-data">
            <thead>
              <tr>
                <th>Payment</th>
                <th>Lender</th>
                <th className="text-right">Due</th>
                <th className="text-right">Paid (USDC)</th>
              </tr>
            </thead>
            <tbody>
              {settled.flatMap((request) =>
                Object.entries(request.legs)
                  .sort(([, a], [, b]) => Number(cents(b) - cents(a)))
                  .map(([lender, due]) => (
                    <tr key={`${request.id}-${lender}`}>
                      <td className="whitespace-nowrap text-smoke">Interest to {formatDate(request.period_end)}</td>
                      <td>
                        <Party name={nameOf(lender)} />
                      </td>
                      <td className="text-right text-smoke">{showCents(due)}</td>
                      <td className="text-right">{showCents(request.paid[lender])}</td>
                    </tr>
                  )),
              )}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Panel>
  );
}

/** A trade's two sides, by name. */
export function Sides({ trade }: { trade: Trade }) {
  return (
    <span className="whitespace-nowrap">
      <Party name={nameOf(trade.seller)} /> <span className="px-1 text-ash">→</span> <Party name={nameOf(trade.buyer)} />
    </span>
  );
}
