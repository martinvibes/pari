// SPDX-License-Identifier: Apache-2.0

// Highlight the main statements; render supporting facts in muted text.
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
      {FACTS.map((fact) => (
        <span key={fact.text} className="flex shrink-0 items-center">
          <span className={fact.statement ? "text-paper" : "text-ash"}>{fact.text}</span>
          <span className="px-8 text-white/25" aria-hidden>
            ·
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
