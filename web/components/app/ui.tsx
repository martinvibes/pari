// SPDX-License-Identifier: Apache-2.0

import { LiveValue } from "@/components/LiveValue";
import { Tag, type Tone } from "@/components/Tag";
import { LedgerId } from "@/components/app/LedgerId";
import { hueOfName } from "@/components/app/party";
import type { Status } from "@/lib/pari/types";

// Presentational building blocks for the app screens, in the darkroom system:
// sharp carbon panels, tracked labels, tabular figures, and colour only where
// it carries meaning (a status, a party).

export { Tag, type Tone };

/** A screen's title. A party's screen wears that party's hue: a seat chip, a
 *  low glow behind the title, and the party id the screen reads the ledger as.
 *  A screen with no party can set its own `accent`. */
export function PageHeader({
  kicker,
  title,
  party,
  partyId,
  accent,
  lede,
  children,
}: {
  kicker?: string;
  title: string;
  /** The screen's own party, by display name. */
  party?: string;
  /** That party's id on the ledger. */
  partyId?: string;
  accent?: string;
  lede?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const hue = accent ?? (party ? hueOfName(party) : undefined);
  return (
    <header className="relative space-y-4">
      {hue ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -left-56 -top-64 -z-10 h-[600px] w-[960px] max-w-none"
          style={{ background: `radial-gradient(closest-side, ${hue}1C, transparent)` }}
        />
      ) : null}
      {kicker && hue ? (
        <p
          className="inline-flex items-center gap-2.5 rounded-pill border px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: hue, borderColor: `${hue}4D`, background: `${hue}12` }}
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-pill" style={{ background: hue, boxShadow: `0 0 8px ${hue}` }} />
          {kicker}
        </p>
      ) : kicker ? (
        <p className="label-data">{kicker}</p>
      ) : null}
      <h1 className="text-6xl font-medium tracking-[-0.03em] sm:text-7xl">{title}</h1>
      {lede ? <p className="max-w-2xl text-lg leading-relaxed text-smoke">{lede}</p> : null}
      {partyId ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="label-data">Reading the ledger as</span>
          <LedgerId id={partyId} />
        </div>
      ) : null}
      {children ? <div className="pt-2">{children}</div> : null}
    </header>
  );
}

export type Stat = { label: string; value: string; signal?: boolean };

/** Headline figures. Values roll and flash when the ledger changes them. */
export function Stats({ items }: { items: Stat[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="border-t border-white/15 px-1 pt-4">
          <dt className="label-data">{item.label}</dt>
          <dd
            className={`mt-3 text-xl font-medium tabular-nums tracking-tight sm:text-2xl lg:text-3xl ${
              item.signal ? "text-amber" : "text-paper"
            }`}
          >
            <LiveValue value={item.value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Panel({
  title,
  note,
  aside,
  children,
  className = "",
}: {
  title: string;
  note?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card min-w-0 space-y-6 p-6 sm:p-8 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-paper">{title}</h2>
          {note ? <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-pewter">{note}</p> : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A facility's lifecycle, as a status: live once closed, done once repaid. */
export const FACILITY_TONE: Record<Status, Tone> = { Syndicating: "wait", Active: "ok", Repaid: "info" };

/** Nothing here yet, framed as a gap the deal will fill. */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 border border-dashed border-white/[0.14] bg-white/[0.015] px-4 py-3.5 text-[15px] leading-relaxed text-pewter">
      <span aria-hidden className="mt-[0.55em] h-2 w-2 shrink-0 rounded-pill border border-ash/70" />
      <div>{children}</div>
    </div>
  );
}

/** Horizontal scroll for wide tables on narrow screens. */
export function TableScroll({ children }: { children: React.ReactNode }) {
  return <div className="-mx-1 overflow-x-auto px-1">{children}</div>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label-data">{label}</span>
      {children}
    </label>
  );
}

/** A labelled fact in a strip, e.g. the facility badge under a page title.
 *  A fact with a `tone` is a status, shown as a Tag. */
export function Facts({ items }: { items: Array<{ label: string; value: string; tone?: Tone }> }) {
  return (
    <div className="panel-subtle inline-flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-3">
          <span className="label-data">{item.label}</span>
          {item.tone ? (
            <Tag tone={item.tone}>{item.value}</Tag>
          ) : (
            <span className="text-[15px] font-medium tabular-nums text-paper">{item.value}</span>
          )}
        </span>
      ))}
    </div>
  );
}
