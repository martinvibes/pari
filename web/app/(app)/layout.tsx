// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import { AppBackground } from "@/components/AppBackground";
import { Wordmark } from "@/components/Logo";
import { PageTransition } from "@/components/PageTransition";
import { ActionFeed } from "@/components/app/ActionFeed";
import { CastNav, LensLink } from "@/components/app/CastNav";
import { LEDGER } from "@/lib/ledger/config";
import { SITE } from "@/lib/site";

// Every screen reads the ledger live as its own party.
export const dynamic = "force-dynamic";

export const metadata = {
  title: { template: "%s · Pari", default: "Pari" },
};

// Chrome for the working app: a top bar with the deal's cast seated by role
// and the privacy lens apart from it, a slim status line with the network and
// the demo-mode disclosure, and a quiet footer.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ActionFeed>
      <div className="relative flex min-h-screen flex-col bg-ink text-paper">
        <AppBackground />
        <header className="sticky top-0 z-40 border-b border-white/10 bg-ink/80 backdrop-blur-xl">
          <nav className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-x-5 gap-y-3 px-4 py-3 sm:px-6">
            <Link href="/" className="shrink-0" aria-label="Back to home">
              <Wordmark />
            </Link>
            <div className="order-last flex w-full min-w-0 justify-center xl:order-none xl:w-auto xl:flex-1">
              <CastNav />
            </div>
            <LensLink />
          </nav>
        </header>
        <div className="relative z-10 flex flex-1 flex-col overflow-x-clip">
          <div className="border-b border-white/[0.07] bg-carbon/80">
            <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-[13px] leading-relaxed sm:flex-nowrap sm:px-6">
              <span className="inline-flex shrink-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-mint">
                <span className="h-1.5 w-1.5 animate-pulse rounded-pill bg-mint shadow-[0_0_8px_rgba(61,220,151,0.8)] motion-reduce:animate-none" />
                {LEDGER.network}
              </span>
              <span aria-hidden className="hidden h-3.5 w-px shrink-0 bg-white/15 sm:block" />
              <p className="min-w-0 flex-1 basis-full text-pewter sm:basis-auto">
                <span className="font-semibold text-amber">Demo mode.</span> One server signs for every party, so
                one browser walks the deal; each screen still reads the ledger as its own party.
              </p>
              <span className="ml-auto hidden shrink-0 items-center gap-1.5 text-[12px] text-ash lg:inline-flex">
                Keys <kbd className="kbd">1</kbd>
                <span aria-hidden>to</span>
                <kbd className="kbd">9</kbd>
              </span>
            </div>
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
