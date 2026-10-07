// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import { StepNumeral } from "@/components/StepNumeral";
import { HeroBackground } from "@/components/HeroBackground";
import { HeroExit } from "@/components/HeroExit";
import { Parallax } from "@/components/Parallax";
import { Scrim } from "@/components/Scrim";
import type { ExitSequence } from "@/lib/heroExit";
import { InvariantBand } from "@/components/InvariantBand";
import { Reveal } from "@/components/Reveal";
import { CountUp } from "@/components/CountUp";
import { StepDiagram } from "@/components/StepDiagrams";
import { PinnedSteps } from "@/components/PinnedSteps";
import { AudienceCards } from "@/components/AudienceCards";
import { GuaranteesStrip } from "@/components/GuaranteesStrip";
import { Spotlight } from "@/components/Spotlight";
import { TickerBand } from "@/components/TickerBand";
import { Term } from "@/components/Term";
import { WordReveal } from "@/components/WordReveal";

// Every claim on this page is a Daml Script test in daml/pari-tests.
// Contract and standard names carry the mono Term voice so they read as objects.
const STEPS = [
  {
    n: "01",
    title: "Syndicate and close",
    kicker: "Action / Commit",
    hue: "#3DDC97",
    body: (
      <>
        Each lender commits and funds its own <Term>CIP-56</Term> allocation. Closing pays the
        borrower from every lender in one transaction, or not at all.
      </>
    ),
    band: "ink" as const,
  },
  {
    n: "02",
    title: "Pay every lender",
    kicker: "Mechanism / Distribute",
    hue: "#5AC8FA",
    body: (
      <>
        The agent fixes the rate and requests interest. The borrower funds one leg per lender, and
        every leg settles together, to the cent.
      </>
    ),
    band: "carbon" as const,
  },
  {
    n: "03",
    title: "Trade the loan",
    kicker: "Outcome / Market",
    hue: "#A78BFA",
    body: (
      <>
        Sell a position delivery-versus-payment. The buyer is screened against the borrower&rsquo;s
        secret DQ list, and interest splits on the trade date.
      </>
    ),
    band: "ink" as const,
  },
];

// How the hero stands down. Read in order, the windows are the argument: the
// cue is spent the instant the reader scrolls, the action has already been
// offered, the lede has been read, and the statement is the last thing to
// leave — it is still dissolving as the invariant band arrives underneath it.
// Opacity and a few pixels of travel only. No blur: the headline is
// background-clip text, and blurring it reads as a rendering fault rather than
// as depth.
const HERO_EXIT: ExitSequence = {
  cue: { at: 0.0, span: 0.22, shift: 10 },
  actions: { at: 0.18, span: 0.34, shift: 12 },
  lede: { at: 0.3, span: 0.34, shift: 14 },
  headline: { at: 0.55, span: 0.45, shift: 18 },
};

// Design facts, stated as oversized numerals. Each holds for every facility on
// Pari and is backed by a test; none is a market metric.
const FACTS = [
  { value: "01", label: "Transaction per payment", note: "Every lender is paid, or none is", hue: "#3DDC97" },
  { value: "00", label: "Funds held by the agent", note: "Payers fund their own allocations", hue: "#FFAC2E" },
  { value: "00", label: "Rival positions visible", note: "A lender sees only its own", hue: "#A78BFA" },
  { value: "03", label: "Information walls", note: "Positions · DQ list · MNPI", hue: "#5AC8FA" },
];

export default function LandingPage() {
  return (
    <>
      {/* The page is one loan's life, closing to maturity. The sections carrying
          data-chapter are its stops, measured by the conductor into a single
          normalised tau: 0 at closing, 1 at maturity. Order is document order,
          so a chapter is added by adding the attribute — nothing else indexes
          them. The names are labels, not keys.

            issuance  hero          one facility, whole
            split     the register  the facility resolves into lender positions
            mechanism how it works  interest streams out to the lenders
            market    who it's for  positions change hands
            maturity  overview      interest paid out, principal repaid

          Hero: the world is the backdrop. Chapter 0's establishing shot of the
          instrument is what sits behind the headline, held off it by a scrim. */}
      <section
        data-chapter="issuance"
        className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-transparent"
      >
        <HeroBackground />
        <HeroExit sequence={HERO_EXIT}>
          <Parallax speed={0.12} className="relative mx-auto w-full max-w-[1280px] px-6 sm:px-16">
            <p
              data-exit="lede"
              className="mb-8 inline-flex items-center gap-2.5 rounded-pill border border-mint/30 bg-mint/[0.08] px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-mint"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-pill bg-mint shadow-[0_0_8px_rgba(61,220,151,0.8)] motion-reduce:animate-none" />
              Running on the Canton DevNet
            </p>
            <h1
              data-exit="headline"
              className="hero-shimmer weight-book max-w-4xl text-5xl font-extralight leading-[1.02] tracking-tight sm:text-7xl lg:text-8xl"
            >
              The private ledger for syndicated loans.
            </h1>
            <p data-exit="lede" className="weight-book mt-8 max-w-xl text-lg font-extralight leading-relaxed text-smoke sm:text-xl">
              Keep the register, pay every lender in one transaction, and settle trades
              delivery-versus-payment. Each lender sees its own position, and nothing else.
            </p>
            <div
              data-exit="actions"
              className="mt-10 flex flex-col items-start gap-5 sm:flex-row sm:items-center"
            >
              <Link
                href="/agent"
                className="rounded-pill bg-paper px-7 py-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-ink transition hover:bg-smoke"
              >
                Open App
              </Link>
              <span className="font-mono text-sm tracking-[0.2em] text-pewter">
                Canton · <span className="text-amber">CIP-56</span> settlement
              </span>
            </div>
          </Parallax>
          <div
            data-exit="cue"
            className="absolute bottom-8 left-6 flex items-center gap-3 sm:left-16"
          >
            <span className="label-data">Scroll</span>
            <span className="h-px w-10 bg-ash" />
          </div>
        </HeroExit>
      </section>

      {/* The register: the thesis, set enormous over the split itself, with
          each lender linked to its term on hover. */}
      <InvariantBand />

      {/* How it works. Desktop: the band pins and one scene morphs through the
          three moments in place (PinnedSteps). Mobile and reduced motion: the
          editorial stacked bands, each with its own animated diagram. */}
      <section id="how-it-works" data-chapter="mechanism">
        <div className="steps-pinned hidden lg:block">
          <PinnedSteps steps={STEPS.map(({ n, title, kicker, hue, body }) => ({ n, title, kicker, hue, body }))} />
        </div>
        <div className="steps-stacked lg:hidden">
        {STEPS.map((step) => (
          <div
            key={step.n}
            className={step.band === "carbon" ? "bg-carbon" : "bg-ink"}
          >
            <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-6 py-20 sm:px-16 lg:grid-cols-2">
              <div>
                <StepNumeral>{step.n}</StepNumeral>
                <Reveal>
                  <h2 className="mt-6 text-4xl font-medium tracking-tight sm:text-5xl">{step.title}</h2>
                  <p className="mt-3 label-data" style={{ color: step.hue }}>
                    {step.kicker}
                  </p>
                  <p className="mt-6 max-w-xl text-lg leading-relaxed text-smoke">{step.body}</p>
                </Reveal>
              </div>
              <div className="flex justify-center lg:justify-end">
                <StepDiagram n={step.n} />
              </div>
            </div>
          </div>
        ))}
        </div>
      </section>

      <TickerBand />
      <AudienceCards />
      <GuaranteesStrip />

      {/* Overview: design facts as numerals in an enclosed panel, not invented
          market metrics. */}
      <section data-chapter="maturity" className="relative bg-transparent">
        <Scrim side="bottom" />
        <div className="hairline" />
        <div className="relative mx-auto max-w-[1280px] px-6 py-20 sm:px-16">
          <div className="flex items-center justify-between">
            <h2 className="text-4xl font-medium tracking-tight sm:text-5xl">
              <WordReveal brightWords={[0]}>Pari overview</WordReveal>
            </h2>
            <span className="label-data">Canton Network</span>
          </div>
          <div className="mt-12 grid grid-cols-2 border border-white/10 lg:grid-cols-4">
            {FACTS.map((fact, i) => (
              <Spotlight
                key={fact.label}
                className={`p-8 ${i < FACTS.length - 1 ? "border-b border-white/10 lg:border-b-0 lg:border-r" : ""} ${
                  i < 2 ? "border-b lg:border-b-0" : ""
                }`}
              >
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-[2px]"
                  style={{ background: `linear-gradient(90deg, ${fact.hue}, transparent)` }}
                />
                <p className="text-5xl font-medium tabular-nums tracking-tight text-paper sm:text-6xl">
                  <CountUp value={fact.value} />
                </p>
                <p className="mt-4 label-data" style={{ color: fact.hue }}>
                  {fact.label}
                </p>
                <p className="mt-1 text-[15px] text-pewter">{fact.note}</p>
              </Spotlight>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
