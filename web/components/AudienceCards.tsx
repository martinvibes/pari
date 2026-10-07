// SPDX-License-Identifier: Apache-2.0

"use client";

import { useEffect, useState } from "react";
import { KickerWipe } from "@/components/KickerWipe";
import { Reveal } from "@/components/Reveal";
import { RollingLink } from "@/components/RollingLink";
import { Spotlight } from "@/components/Spotlight";
import { Term } from "@/components/Term";
import { WordReveal } from "@/components/WordReveal";
import { Scrim } from "@/components/Scrim";
import { hueOf } from "@/components/app/party";
import { prefersReducedMotion, useInView } from "@/lib/useInView";

// Per-role glyphs in the step-diagram language: a ring sealed by a chord for
// the agent's register, a stream for a lender's income, two commitments feeding
// one line for the borrower. Each path draws itself when the section enters
// (pathLength + dashoffset transition, same mechanism as the card borders).
// The drawn stroke wears the role's hue from the app: Agent, Alder, Northwind.
type Role = "agent" | "lender" | "borrower";

const ROLE_HUES: Record<Role, string> = {
  agent: hueOf("agent"),
  lender: hueOf("alder"),
  borrower: hueOf("northwind"),
};

function Glyph({ role, hidden, delay }: { role: Role; hidden: boolean; delay: number }) {
  const hue = ROLE_HUES[role];
  const draw = (extraDelay = 0): React.CSSProperties => ({
    strokeDasharray: 1,
    strokeDashoffset: hidden ? 1 : 0,
    transition: "stroke-dashoffset 1s cubic-bezier(0.22, 1, 0.36, 1)",
    transitionDelay: `${delay + extraDelay}ms`,
  });
  const common = {
    fill: "none",
    stroke: "#A3A3AA",
    strokeWidth: 1.5,
    pathLength: 1,
  } as const;

  if (role === "agent") {
    return (
      <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden>
        <circle cx="32" cy="32" r="22" {...common} style={draw()} />
        <path d="M 16 32 H 48" {...common} stroke={hue} style={draw(350)} />
      </svg>
    );
  }
  if (role === "lender") {
    return (
      <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden>
        <path d="M 8 42 H 56" {...common} style={draw()} />
        <path d="M 8 42 C 24 42 28 20 42 20 C 48 20 52 26 56 14" {...common} stroke={hue} style={draw(350)} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden>
      <circle cx="23" cy="25" r="12" {...common} style={draw()} />
      <circle cx="41" cy="25" r="12" {...common} style={draw(200)} />
      <path d="M 14 48 H 50" {...common} stroke={hue} style={draw(450)} />
    </svg>
  );
}

const AUDIENCES: Array<{
  index: string;
  role: Role;
  title: string;
  body: React.ReactNode;
  cta: string;
  href: string;
}> = [
  {
    index: "01",
    role: "agent",
    title: "Agent",
    body: (
      <>
        Keep the register, fix rates, request payments and settle trades. Never hold the money, and
        never move a lender&rsquo;s position on your own.
      </>
    ),
    cta: "Open the desk",
    href: "/agent",
  },
  {
    index: "02",
    role: "lender",
    title: "Lender",
    body: (
      <>
        Hold a private, co-signed position. Get paid with every other lender in one transaction,
        receive MNPI only on the private side, and sell <Term>DvP</Term>.
      </>
    ),
    cta: "View a position",
    href: "/lender/alder",
  },
  {
    index: "03",
    role: "borrower",
    title: "Borrower",
    body: (
      <>
        Fund one <Term>CIP-56</Term> allocation per payment and know every lender is paid pro
        rata, to the cent. Keep the DQ list secret.
      </>
    ),
    cta: "Pay the syndicate",
    href: "/borrower",
  },
];

export function AudienceCards() {
  const { ref, inView } = useInView<HTMLDivElement>(0.15);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!prefersReducedMotion()) setArmed(true);
  }, []);

  const hidden = armed && !inView;

  return (
    <section data-chapter="market" className="relative bg-transparent">
      <Scrim side="bottom" />
      <div className="relative mx-auto max-w-[1280px] px-6 py-20 sm:px-16 sm:py-24">
        <KickerWipe className="label-data">Workflow / Roles</KickerWipe>
        <h2 className="mt-5 text-5xl font-medium tracking-tight sm:text-6xl lg:text-7xl">
          <WordReveal brightWords={[3]}>Who it is for</WordReveal>
        </h2>

        <div ref={ref} className="mt-14 grid gap-4 lg:grid-cols-3 lg:gap-0">
          {AUDIENCES.map((audience, index) => (
            <Spotlight
              key={audience.title}
              className="audience-card relative min-h-[24rem] overflow-hidden bg-white/[0.02] p-8 lg:p-10"
            >
              <svg
                aria-hidden
                className="pointer-events-none absolute inset-0 h-full w-full"
                preserveAspectRatio="none"
                viewBox="0 0 100 100"
              >
                <rect
                  x="0.5"
                  y="0.5"
                  width="99"
                  height="99"
                  fill="none"
                  pathLength="1"
                  stroke="rgba(255,255,255,0.25)"
                  strokeDasharray="1"
                  strokeDashoffset={hidden ? 1 : 0}
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  style={{
                    transition: "stroke-dashoffset 1.2s cubic-bezier(0.22, 1, 0.36, 1)",
                    transitionDelay: `${index * 150}ms`,
                  }}
                />
              </svg>

              {/* Watermark index: the step-numeral language, faded to texture. */}
              <span
                aria-hidden
                className="pointer-events-none absolute -right-2 -top-6 text-[9rem] font-normal leading-none text-white/[0.05]"
              >
                {audience.index}
              </span>

              <Reveal
                className="relative flex h-full min-h-[20rem] flex-col"
                delay={600 + index * 150}
              >
                <Glyph role={audience.role} hidden={hidden} delay={800 + index * 150} />
                <h3 className="mt-8 text-3xl font-medium tracking-tight sm:text-4xl">
                  {audience.title}
                </h3>
                <p className="mt-5 max-w-sm text-lg leading-relaxed text-smoke">{audience.body}</p>
                <RollingLink
                  href={audience.href}
                  className="mt-auto pt-10 font-mono text-[13px] font-semibold uppercase tracking-[0.15em]"
                  style={{ color: ROLE_HUES[audience.role] }}
                >
                  {`${audience.cta} →`}
                </RollingLink>
              </Reveal>
            </Spotlight>
          ))}
        </div>
      </div>
    </section>
  );
}
