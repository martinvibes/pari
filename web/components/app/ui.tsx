// SPDX-License-Identifier: Apache-2.0

import { LiveValue } from "@/components/LiveValue";

// Presentational building blocks for the app screens, in the darkroom system:
// sharp carbon panels, tracked labels, tabular figures, one accent for live
// signals only.

export function PageHeader({
  kicker,
  title,
  lede,
  children,
}: {
  kicker?: string;
  title: string;
  lede?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="space-y-3">
      {kicker ? <p className="label-data">{kicker}</p> : null}
      <h1 className="text-6xl font-light tracking-tight sm:text-7xl">{title}</h1>
      {lede ? <p className="max-w-2xl text-smoke">{lede}</p> : null}
      {children ? <div className="pt-3">{children}</div> : null}
    </header>
  );
}

export type Stat = { label: string; value: string; signal?: boolean };

/** Headline figures. Values roll and flash when the ledger changes them. */
export function Stats({ items }: { items: Stat[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="border-t border-white/10 px-1 pt-4">
          <dt className="label-data">{item.label}</dt>
          <dd
            className={`mt-3 text-xl font-light tabular-nums sm:text-2xl lg:text-3xl ${
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
          <h2 className="text-lg font-semibold text-paper">{title}</h2>
          {note ? <p className="mt-1 max-w-xl text-xs leading-relaxed text-ash">{note}</p> : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

type Tone = "neutral" | "paper" | "signal" | "alert";

const TONES: Record<Tone, string> = {
  neutral: "border-white/20 text-smoke",
  paper: "border-paper/60 text-paper",
  signal: "border-amber/60 text-amber",
  alert: "border-red-400/60 text-red-400",
};

/** A pill status label. `signal` marks something live and waiting. */
export function Tag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-pill border px-2.5 py-0.5 text-[11px] uppercase tracking-[0.12em] ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ash">{children}</p>;
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

/** A labelled fact in a strip, e.g. the facility badge under a page title. */
export function Facts({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div className="panel-subtle inline-flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-3">
          <span className="label-data">{item.label}</span>
          <span className="text-sm tabular-nums text-paper">{item.value}</span>
        </span>
      ))}
    </div>
  );
}
