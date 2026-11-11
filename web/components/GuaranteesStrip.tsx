// SPDX-License-Identifier: Apache-2.0

"use client";

import { useEffect, useState } from "react";
import { KickerWipe } from "@/components/KickerWipe";
import { Term } from "@/components/Term";
import { WordReveal } from "@/components/WordReveal";
import { prefersReducedMotion, useInView } from "@/lib/useInView";

const GUARANTEES = [
  {
    index: "01",
    title: "The agent holds no money",
    body: (
      <>
        Every payment is a <Term>CIP-56</Term> allocation funded by the payer, and settles only
        with the payer, the payee and the agent together.
      </>
    ),
  },
  {
    index: "02",
    title: "No one is overpaid",
    body: <>Each allocation must equal its lender&rsquo;s leg to the cent. No settlement can pay anyone more than it is owed.</>,
  },
  {
    index: "03",
    title: "Every lender, or none",
    body: <>All legs of a payment settle in one transaction. A short payment pays every lender the same fraction.</>,
  },
  {
    index: "04",
    title: "Every claim is a test",
    body: <>Each guarantee is a Daml Script test in the open-source repo, published under Apache-2.0.</>,
  },
];

// The same four guarantees as the NEAR build keeps them: the money sits in the
// rules contract, and the tests are Rust.
const NEAR_BODIES: Record<string, React.ReactNode> = {
  "01": <>The rules contract holds the money. The agent can ask for a settlement; it cannot send a token anywhere.</>,
  "02": (
    <>
      The enclave refuses a total that differs from the register, and the contract never credits
      lenders more than the borrower paid in.
    </>
  ),
  "04": <>Each guarantee is a Rust test in the open-source repo, published under Apache-2.0.</>,
};

// One guarantee, ticking on as it crosses the viewport: the numeral brightens,
// the marker dot swells, the title lifts to full paper. Rows stay lit once
// passed, so scrolling the strip reads as working down a checklist.
function GuaranteeRow({
  guarantee,
  index,
  stripHidden,
  near,
}: {
  guarantee: (typeof GUARANTEES)[number];
  index: number;
  stripHidden: boolean;
  near: boolean;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.6);
  const lit = inView && !stripHidden;

  return (
    <div
      ref={ref}
      className="relative grid gap-4 border-b border-white/10 py-8 sm:grid-cols-[8rem_1fr] sm:items-center sm:py-10"
    >
      <span
        aria-hidden
        className="absolute -left-[2.15rem] top-10 sm:-left-[3.7rem] sm:top-1/2 sm:-translate-y-1/2"
      >
        <span
          className={`block h-2 w-2 transition-all duration-500 ${
            lit ? "bg-mint shadow-[0_0_12px_rgba(61,220,151,0.9)]" : "bg-paper"
          }`}
          style={
            stripHidden
              ? { opacity: 0, transform: "scale(0)" }
              : {
                  opacity: 1,
                  transform: lit ? "scale(1.5)" : "scale(1)",
                  transitionDelay: `${index * 120}ms`,
                }
          }
        />
      </span>
      <span
        className={`text-6xl font-normal leading-none transition-colors duration-700 sm:text-7xl ${
          lit ? "text-mint/60" : "text-white/15"
        }`}
      >
        {guarantee.index}
      </span>
      <div>
        <h3
          className={`text-2xl font-medium tracking-tight transition-colors duration-700 sm:text-3xl ${
            lit ? "text-paper" : "text-smoke"
          }`}
        >
          {guarantee.title}
        </h3>
        <p className="mt-2 max-w-2xl text-lg leading-relaxed text-smoke">{(near && NEAR_BODIES[guarantee.index]) || guarantee.body}</p>
      </div>
    </div>
  );
}

export function GuaranteesStrip({ near = false }: { near?: boolean }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.15);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!prefersReducedMotion()) setArmed(true);
  }, []);

  const hidden = armed && !inView;

  return (
    <section className="relative bg-transparent">
      <div className="mx-auto max-w-[1280px] px-6 py-20 sm:px-16 sm:py-24">
        <KickerWipe className="label-data">Design / Guarantees</KickerWipe>
        <h2 className="mt-5 max-w-3xl text-5xl font-medium tracking-tight sm:text-6xl lg:text-7xl">
          <WordReveal brightWords={[3]}>Built into the ledger</WordReveal>
        </h2>

        <div ref={ref} className="relative mt-14 pl-8 sm:pl-14">
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-px origin-top bg-white/20 transition-transform duration-[1500ms] ease-out"
            style={{ transform: hidden ? "scaleY(0)" : "scaleY(1)" }}
          />

          {GUARANTEES.map((guarantee, index) => (
            <GuaranteeRow
              key={guarantee.index}
              guarantee={guarantee}
              index={index}
              stripHidden={hidden}
              near={near}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
