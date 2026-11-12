// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import { Lock } from "@/components/app/Screen";
import { Explore, short, whose } from "@/components/near/parts";
import { Prove } from "@/components/near/Prove";
import { transactionsOf } from "@/lib/near/activity";
import type { PublicRecord } from "@/lib/near/books";
import { accountUrl, NEAR, txUrl, UNITS_PER_CENT } from "@/lib/near/config";
import { actionOf, told } from "@/lib/near/record";
import type { Seen } from "@/lib/near/session";
import { formatCents } from "@/lib/pari/money";

const RECENT = 4;

/** The public chain's side of a desk: what anyone can read about the same
 *  deal with no key. Everything public on a desk lives in this one column, so
 *  the desk itself holds only what the party's key opened. */
export function ChainSaw({ seen, record }: { seen: Seen; record: PublicRecord[] | null }) {
  const { chain, envelope, persona, view } = seen;
  const hashes = transactionsOf(chain.deal_id);
  const lines = (record ?? []).map((line, index) => ({ line, index })).reverse();
  const last = lines[0];
  const bytes = Buffer.from(envelope.sealed, "base64").length;
  const provable =
    view.role === "party"
      ? [...(view.position ? [{ item: "position", label: "What it holds" }] : []), { item: "cash", label: "Its cash" }]
      : [
          { item: "register", label: "The register" },
          { item: "outstanding", label: "The outstanding total" },
        ];

  return (
    <aside
      aria-label="What the chain saw"
      className="border-t border-white/[0.08] bg-ink px-5 pb-8 sm:px-7 xl:sticky xl:top-0 xl:h-screen xl:overflow-y-auto xl:border-l xl:border-t-0 xl:px-5"
    >
      <div className="flex h-14 items-center justify-between gap-3">
        <h2 className="text-[15px] font-medium text-paper">What the chain saw</h2>
        <span className="rounded-pill border border-white/[0.17] px-2.5 text-[11.5px] leading-[18px] text-pewter">no key</span>
      </div>
      <p className="text-[12.5px] leading-relaxed text-ash">
        Anyone can read this side from NEAR. The desk beside it was opened with {whose(persona)} key.
      </p>

      {last ? (
        <Block title="Last action" aside={`#${last.index + 1}`}>
          <p className="text-[13.5px] font-medium text-paper">
            {actionOf(last.line)}
            {last.line.ok ? null : <span className="ml-2 font-normal text-rose">Refused</span>}
          </p>
          <p className={`mt-1 text-[12.5px] leading-relaxed ${last.line.ok ? "text-pewter" : "text-rose"}`}>{told(last.line)}</p>
          {hashes[last.index] ? (
            <p className="mt-2 text-[12.5px]">
              <Explore href={txUrl(hashes[last.index]!)}>Open in NEAR explorer</Explore>
            </p>
          ) : null}
        </Block>
      ) : null}

      <Block title="The books, as the chain holds them">
        <dl className="text-[12.5px]">
          <Row label="Fingerprint">{short(chain.root)}</Row>
          <Row label="Actions run">{chain.seq}</Row>
          <Row label="Held for the deal">{formatCents(BigInt(chain.held) / UNITS_PER_CENT)}</Row>
          <Row label="Contract">
            <Explore href={accountUrl(NEAR.ledger)}>{NEAR.ledger}</Explore>
          </Row>
        </dl>
      </Block>

      <Block
        title={
          <span className="inline-flex items-center gap-2">
            <Lock className="text-iris" />
            {persona.name}&apos;s envelope
          </span>
        }
        aside="sealed"
      >
        <p className="max-h-[58px] overflow-hidden break-all font-mono text-[11.5px] leading-[1.65] text-graphite">{envelope.sealed.slice(0, 160)}</p>
        <p className="mt-2 text-[12px] leading-relaxed text-ash">
          {bytes.toLocaleString("en-US")} bytes, one of {chain.parties.length} envelopes on the chain. Without {whose(persona)} key they are noise.
        </p>
        {envelope.commitment ? (
          <div className="mt-3.5">
            <p className="text-[12px] text-pewter">Prove one fact from it, and nothing else</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {provable.map(({ item, label }) => (
                <Prove key={item} persona={persona.id} item={item} label={label} />
              ))}
            </div>
          </div>
        ) : null}
      </Block>

      {lines.length > 1 ? (
        <Block title="The record" aside={`${lines.length} lines`}>
          <ol>
            {lines.slice(1, 1 + RECENT).map(({ line, index }) => (
              <li key={index} className="flex items-baseline gap-2.5 border-t border-white/[0.08] py-2 text-[12.5px]">
                <span className="fig w-6 shrink-0 text-graphite">{index + 1}</span>
                <span className={`min-w-0 flex-1 ${line.ok ? "text-smoke" : "text-rose"}`}>
                  {actionOf(line)}
                  {line.ok ? null : ", refused"}
                </span>
                {hashes[index] ? <Explore href={txUrl(hashes[index]!)}>Explorer</Explore> : null}
              </li>
            ))}
          </ol>
          <p className="border-t border-white/[0.08] pt-2.5 text-[12.5px]">
            <Link href="/visibility" className="text-paper underline decoration-white/30 underline-offset-4 transition hover:decoration-paper">
              The whole record, and who sees what
            </Link>
          </p>
        </Block>
      ) : null}
    </aside>
  );
}

function Block({ title, aside, children }: { title: React.ReactNode; aside?: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 border-t border-white/[0.08] pt-4">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h3 className="text-[12.5px] font-medium text-pewter">{title}</h3>
        {aside ? <span className="fig text-[11.5px] text-graphite">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-[5px]">
      <dt className="text-ash">{label}</dt>
      <dd className="fig min-w-0 truncate text-right text-paper">{children}</dd>
    </div>
  );
}
