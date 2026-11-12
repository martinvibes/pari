// SPDX-License-Identifier: Apache-2.0

import { LiveValue } from "@/components/LiveValue";
import { Tag, type Tone } from "@/components/Tag";
import { LedgerId } from "@/components/app/LedgerId";
import { hueOfName } from "@/components/app/party";
import type { Status } from "@/lib/pari/types";

// Presentational building blocks for the app screens: a one-line title, one
// row of facts, flat ruled sections, tabular figures, and colour only where it
// carries meaning (a status, a party).

export { Tag, type Tone };

/** A screen's title in one line, with the party it reads the ledger as. */
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
    <header className="space-y-3 border-b border-white/[0.08] pb-5">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
        <h1 className="text-[22px] font-normal leading-none tracking-[-0.015em] text-paper">{title}</h1>
        {kicker ? (
          <>
            <span aria-hidden className="h-4 w-px bg-white/[0.17]" />
            <span className="inline-flex items-center gap-2 text-[13.5px] text-smoke">
              {hue ? <span aria-hidden className="h-2 w-2 rounded-pill" style={{ background: hue }} /> : null}
              {kicker}
            </span>
          </>
        ) : null}
      </div>
      {lede ? <p className="max-w-2xl text-[13.5px] leading-relaxed text-pewter">{lede}</p> : null}
      {partyId ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="label-data">Reading the ledger as</span>
          <LedgerId id={partyId} />
        </div>
      ) : null}
      {children}
    </header>
  );
}

export type Stat = { label: string; value: string; signal?: boolean; note?: string };

/** The few figures a screen opens with, as one row. Values roll and flash
 *  when the ledger changes them. */
export function Stats({ items }: { items: Stat[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-4 border-b border-white/[0.08] pb-[18px] lg:flex lg:flex-wrap lg:justify-between">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="label-data">{item.label}</dt>
          <dd className={`mt-1 text-[14px] ${item.signal ? "text-amber" : "text-paper"}`}>
            <span className="fig whitespace-nowrap">
              <LiveValue value={item.value} />
            </span>
            {item.note ? <span className="ml-1.5 text-[12.5px] text-ash">{item.note}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A section of a screen: a title, an optional line about it, and its content
 *  under a rule. Flat, so the one lit card on the screen stays the lit thing. */
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
    <section className={`min-w-0 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-2.5">
        <h2 className="text-[15px] font-medium leading-5 text-paper">{title}</h2>
        {aside ? <div className="text-[12px] text-ash">{aside}</div> : null}
      </div>
      <div className="space-y-4">{children}</div>
      {note ? <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-ash">{note}</p> : null}
    </section>
  );
}

/** A facility's lifecycle, as a status: live once closed, done once repaid. */
export const FACILITY_TONE: Record<Status, Tone> = { Syndicating: "wait", Active: "ok", Repaid: "info" };

/** Nothing here yet, said in one ruled line. */
export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="border-y border-white/[0.08] py-3 text-[13.5px] leading-relaxed text-ash">{children}</p>;
}

/** Horizontal scroll for wide tables on narrow screens. */
export function TableScroll({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12.5px] text-pewter">{label}</span>
      {children}
    </label>
  );
}

/** A labelled fact in a strip, e.g. the facility badge under a page title.
 *  A fact with a `tone` is a status, shown as a Tag. */
export function Facts({ items }: { items: Array<{ label: string; value: string; tone?: Tone }> }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-2">
          <span className="label-data">{item.label}</span>
          {item.tone ? <Tag tone={item.tone}>{item.value}</Tag> : <span className="text-[13.5px] tabular-nums text-paper">{item.value}</span>}
        </span>
      ))}
    </div>
  );
}
