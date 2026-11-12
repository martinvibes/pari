// SPDX-License-Identifier: Apache-2.0

// One screen of the app: a one-line header that says where you are, the body,
// and, beside a desk, what the public chain saw. The header never grows past a
// line, so the first thing on the screen is the work.

export function Screen({
  title,
  context,
  aside,
  chain,
  children,
}: {
  title: string;
  /** What the screen is about, after the title: the facility, or one sentence. */
  context?: React.ReactNode;
  /** The far end of the header: whose key opened this screen. */
  aside?: React.ReactNode;
  /** The public chain's side of the same screen, as a column. */
  chain?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={chain ? "xl:grid xl:grid-cols-[minmax(0,1fr)_304px]" : undefined}>
      <div className="min-w-0">
        <header className="flex min-h-14 flex-wrap items-center gap-x-3.5 gap-y-1 border-b border-white/[0.08] px-5 py-3 sm:px-7">
          <h1 className="whitespace-nowrap text-[22px] font-normal leading-none tracking-[-0.015em] text-paper">{title}</h1>
          {context ? (
            <>
              <span aria-hidden className="hidden h-4 w-px bg-white/[0.17] sm:block" />
              <div className="min-w-0 basis-full text-[13.5px] text-smoke sm:basis-auto">{context}</div>
            </>
          ) : null}
          {aside ? <div className="flex items-center gap-2 text-[12.5px] text-ash sm:ml-auto">{aside}</div> : null}
        </header>
        <div className={`space-y-6 px-5 py-[22px] sm:px-7 ${chain ? "max-w-[1120px]" : "max-w-[1240px]"}`}>{children}</div>
      </div>
      {chain}
    </div>
  );
}

/** The closed padlock: this was opened with a key, or is sealed to one. */
export function Lock({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden width="10" height="12" viewBox="0 0 10 12" fill="none" stroke="currentColor" strokeWidth="1.2" className={`shrink-0 ${className}`}>
      <rect x="1" y="5" width="8" height="6" />
      <path d="M3 5V3.2a2 2 0 0 1 4 0V5" />
    </svg>
  );
}

/** The one card on a screen that is lit: the thing to do next. Everything else
 *  on the screen is a flat ruled section. `tone` tints it for a refusal. */
export function Lit({ children, className = "", tone }: { children: React.ReactNode; className?: string; tone?: "stop" }) {
  return <section className={`min-w-0 border bg-coal ${tone === "stop" ? "border-rose/55" : "border-white/[0.17]"} ${className}`}>{children}</section>;
}

/** Where a deal stands in a cycle, as one line: the steps done, the step this
 *  screen is waiting on, and the ones to come. */
export function Steps({ steps, at }: { steps: string[]; at: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-white/[0.08] px-6 py-2.5 text-[12.5px]">
      {steps.map((step, i) => (
        <li key={step} aria-current={i === at ? "step" : undefined} className={`flex items-center gap-2 ${i === at ? "font-medium text-paper" : i < at ? "text-ash" : "text-graphite"}`}>
          <span
            className={`flex h-[18px] w-[18px] items-center justify-center rounded-pill font-mono text-[11px] ${
              i === at ? "bg-paper text-ink" : "border border-white/[0.17]"
            }`}
          >
            {i < at ? "✓" : i + 1}
          </span>
          {step}
        </li>
      ))}
    </ol>
  );
}
