// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import { AppBackground } from "@/components/AppBackground";
import { Wordmark } from "@/components/Logo";
import { PageTransition } from "@/components/PageTransition";
import { ActionFeed } from "@/components/app/ActionFeed";
import { PersonaTabs } from "@/components/app/PersonaTabs";
import { SITE } from "@/lib/site";

// Every screen reads the ledger live as its own party.
export const dynamic = "force-dynamic";

export const metadata = {
  title: { template: "%s · Pari", default: "Pari" },
};

// Chrome for the working app: a persistent top bar with one tab per party in
// the deal, the demo-mode disclosure, and a quiet footer.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ActionFeed>
      <div className="relative flex min-h-screen flex-col bg-ink text-paper">
        <AppBackground />
        <header className="sticky top-0 z-40 border-b border-white/10 bg-ink/90 backdrop-blur-xl">
          <nav className="mx-auto grid max-w-[1280px] grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-3 px-4 py-3 sm:flex sm:gap-4 sm:px-6 sm:py-4">
            <Link href="/" className="shrink-0" aria-label="Back to home">
              <Wordmark />
            </Link>
            <PersonaTabs />
            <span className="hidden items-center gap-2 justify-self-end rounded-pill border border-white/20 px-3 py-1.5 text-[13px] uppercase tracking-[0.12em] text-smoke sm:inline-flex">
              <span className="glow-signal-dot h-1.5 w-1.5 animate-pulse rounded-pill bg-amber motion-reduce:animate-none" />
              Canton sandbox
            </span>
          </nav>
        </header>
        <div className="relative z-10 flex flex-1 flex-col">
          <div className="border-b border-white/10 bg-carbon">
            <p className="mx-auto max-w-[1280px] px-6 py-2.5 text-xs leading-relaxed text-smoke">
              <span className="text-paper">Demo mode.</span> This server signs as every party so one
              browser can walk the whole deal. Each screen reads the ledger as its own party, and in
              production each party signs from its own node under the same ledger rules.
            </p>
          </div>
          <main className="mx-auto w-full max-w-[1280px] flex-1 px-6 py-12 sm:py-16">
            <PageTransition>{children}</PageTransition>
          </main>
          <footer className="border-t border-white/10">
            <div className="mx-auto flex max-w-[1280px] flex-col items-start justify-between gap-3 px-6 py-8 sm:flex-row sm:items-center">
              <p className="label-data">© 2026 The Pari authors</p>
              <div className="flex flex-wrap items-center gap-6">
                <Link href="/docs" className="label-data transition hover:text-paper">
                  Docs
                </Link>
                <a href={SITE.repo} className="label-data transition hover:text-paper">
                  GitHub
                </a>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </ActionFeed>
  );
}
