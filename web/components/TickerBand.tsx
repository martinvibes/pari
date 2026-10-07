// SPDX-License-Identifier: Apache-2.0

// Highlight the main statements; render supporting facts in muted text. The
// separators cycle through the signal hues, a quiet thread of colour.
const HUES = ["#3DDC97", "#5AC8FA", "#A78BFA", "#FFAC2E"];
const FACTS: Array<{ text: string; statement?: boolean }> = [
  { text: "Every lender paid in one transaction", statement: true },
  { text: "CIP-56 settlement" },
  { text: "Private positions", statement: true },
  { text: "Secret DQ screening" },
  { text: "MNPI walls", statement: true },
  { text: "ACT/360 to the cent" },
  { text: "Delivery versus payment" },
];

function FactSequence({ hidden = false }: { hidden?: boolean }) {
  return (
    <div className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {FACTS.map((fact, i) => (
        <span key={fact.text} className="flex shrink-0 items-center">
          <span className={fact.statement ? "font-semibold text-paper" : "font-medium text-pewter"}>{fact.text}</span>
          <span className="px-8" aria-hidden>
            <span
              className="block h-1.5 w-1.5 rounded-pill"
              style={{ background: HUES[i % HUES.length], boxShadow: `0 0 8px ${HUES[i % HUES.length]}` }}
            />
          </span>
        </span>
      ))}
    </div>
  );
}

export function TickerBand() {
  return (
    <section aria-label="Pari facts" className="relative h-20 overflow-hidden">
      <div className="hairline absolute inset-x-0 top-0" />
      <div className="ticker-mask h-full">
        <div className="ticker-track flex h-full w-max items-center whitespace-nowrap text-base uppercase tracking-[0.18em]">
          <FactSequence />
          <FactSequence hidden />
        </div>
      </div>
      <div className="hairline absolute inset-x-0 bottom-0" />
    </section>
  );
}
