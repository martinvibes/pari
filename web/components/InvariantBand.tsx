// SPDX-License-Identifier: Apache-2.0

"use client";

import { useEffect, useState } from "react";
import { Scrim } from "@/components/Scrim";
import { hueOf } from "@/components/app/party";
import { prefersReducedMotion, useInView } from "@/lib/useInView";

// The band that carries the thesis: the register of one loan, set enormous and
// assembled on scroll. On fine pointers each lender's term is live: hovering
// one dims the others, which is exactly what each lender sees on the ledger.
// The sum stays with the agent and the borrower. Each lender wears the hue
// its counterpart (Alder, Birch, Cedar) wears in the app.

type Lender = "A" | "B" | "C";

const LEGS: Array<{ id: Lender; term: string; share: number; name: string; hue: string; body: string }> = [
  {
    id: "A",
    hue: hueOf("alder"),
    term: "50",
    share: 0.5,
    name: "Lender A",
    body: "Holds 50 of the 100. Sees its own position, its own interest and its own receipts. Never the 30 or the 20.",
  },
  {
    id: "B",
    hue: hueOf("birch"),
    term: "30",
    share: 0.3,
    name: "Lender B",
    body: "Paid in the same transaction as A and C, to the cent. A short payment shortens every lender's leg by the same fraction.",
  },
  {
    id: "C",
    hue: hueOf("cedar"),
    term: "20",
    share: 0.2,
    name: "Lender C",
    body: "Sells to a new buyer delivery-versus-payment. The borrower learns who bought, never at what price.",
  },
];

// A lender's share of the facility as a wedge inside the facility ring.
function ShareGlyph({ share, hue }: { share: number; hue: string }) {
  const angle = 2 * Math.PI * share;
  const x = 24 + 17 * Math.sin(angle);
  const y = 24 - 17 * Math.cos(angle);
  const largeArc = share > 0.5 ? 1 : 0;
  return (
    <svg viewBox="0 0 48 48" className="h-9 w-9" aria-hidden>
      <circle cx="24" cy="24" r="17" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
      <path d={`M24 24 L24 7 A17 17 0 ${largeArc} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`} fill={hue} />
    </svg>
  );
}

export function InvariantBand() {
  const { ref, inView } = useInView<HTMLDivElement>(0.35);
  const [armed, setArmed] = useState(false);
  const [active, setActive] = useState<Lender | null>(null);

  useEffect(() => {
    if (!prefersReducedMotion()) setArmed(true);
  }, []);

  const hidden = armed && !inView;
  const part = (extra: string) =>
    `inline-block transition-all duration-700 ease-out ${
      hidden ? extra : "translate-x-0 opacity-100"
    }`;
  const style = (delay: number) => ({ transitionDelay: `${delay}ms` });
  const term = (id: Lender) =>
    `cursor-default transition-opacity duration-300 ${
      active && active !== id ? "opacity-30" : "opacity-100"
    }`;
  const hueOfLeg = (id: Lender) => ({ color: LEGS.find((leg) => leg.id === id)?.hue });
  const hover = (id: Lender) => ({
    onPointerEnter: () => setActive(id),
    onPointerLeave: () => setActive(null),
  });
  const operator = (symbol: string, delay: number) => (
    <span className={`${part("opacity-0")} text-graphite`} style={style(delay)}>
      {symbol}
    </span>
  );

  return (
    <section
      id="protocol"
      data-chapter="split"
      className="relative overflow-hidden bg-transparent text-paper"
    >
      <Scrim side="bottom" />
      <div ref={ref} className="relative mx-auto max-w-[1280px] px-6 py-24 sm:px-16 sm:py-28">
        <p className="text-center font-normal leading-none tracking-tight text-[clamp(2.5rem,8vw,8.5rem)]">
          <span className={`${part("-translate-x-12 opacity-0")} ${term("A")}`} style={{ ...style(0), ...hueOfLeg("A") }} {...hover("A")}>
            50
          </span>{" "}
          {operator("+", 200)}{" "}
          <span className={`${part("opacity-0")} ${term("B")}`} style={{ ...style(300), ...hueOfLeg("B") }} {...hover("B")}>
            30
          </span>{" "}
          {operator("+", 400)}{" "}
          <span className={`${part("translate-x-12 opacity-0")} ${term("C")}`} style={{ ...style(0), ...hueOfLeg("C") }} {...hover("C")}>
            20
          </span>{" "}
          {operator("=", 550)}{" "}
          <span className={`${part("opacity-0")} ${active ? "opacity-30" : ""} transition-opacity duration-300`} style={style(700)}>
            100
          </span>
        </p>
        <p
          className={`mt-6 text-center text-sm font-medium uppercase tracking-[0.2em] text-ash transition-all duration-700 ${
            hidden ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"
          }`}
          style={style(850)}
        >
          One loan&rsquo;s register. Each lender sees its own term; only the agent and borrower see the sum
        </p>

        <div className="mt-16 grid border-t border-white/15 sm:mt-20 sm:grid-cols-3">
          {LEGS.map((leg, i) => (
            <div
              key={leg.id}
              onPointerEnter={() => setActive(leg.id)}
              onPointerLeave={() => setActive(null)}
              className={`border-t border-white/15 py-8 transition-opacity duration-300 sm:border-t-0 sm:px-10 ${
                i < LEGS.length - 1 ? "sm:border-r sm:border-white/15" : ""
              } ${i === 0 ? "sm:pl-0" : ""} ${active && active !== leg.id ? "opacity-40" : "opacity-100"}`}
            >
              <div className="flex items-center justify-between">
                <ShareGlyph share={leg.share} hue={leg.hue} />
                <span
                  className="rounded-pill border px-3 py-1 font-mono text-[13px] font-semibold tracking-[0.12em]"
                  style={{ color: leg.hue, borderColor: `${leg.hue}66`, background: `${leg.hue}14` }}
                >
                  {leg.term}M
                </span>
              </div>
              <h3 className="mt-6 text-2xl font-medium tracking-tight sm:text-3xl">{leg.name}</h3>
              <p className="mt-4 max-w-sm text-lg leading-relaxed text-smoke">{leg.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
