// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import { AppBackground } from "@/components/AppBackground";
import { Wordmark } from "@/components/Logo";
import { PageTransition } from "@/components/PageTransition";
import { ActionFeed, type FeedWording } from "@/components/app/ActionFeed";
import { CastNav, LensLink, SeatKeys } from "@/components/app/CastNav";
import { holdsKeysFor, NEAR } from "@/lib/near/config";
import { PERSONAS } from "@/lib/pari/personas";
import { SITE } from "@/lib/site";

// Every screen reads the ledger live as its own party. Next.js would
// otherwise keep the answer to a chain read and serve it again later.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata = {
  title: { template: "%s · Pari", default: "Pari" },
};

// Every action runs the books inside the enclave before the contract answers,
// so the receipt says what the wait is for.
const WORDING: FeedWording = {
  pending: "Sent to NEAR",
  waiting: "The contract is running the books in the enclave and checking the answer. On testnet this takes from ten seconds to two minutes.",
  refused: "Refused",
  unchanged: "Nothing changed: the books and the money are as they were.",
};

// Chrome for the working app. On a wide page everything that is not the
// party's own screen sits in one column down the side: the deal's cast as
// place cards seated by role, the privacy lens, and the network with the
// demo-mode disclosure. A narrower page carries the same along its top.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const readOnly = !PERSONAS.every((persona) => holdsKeysFor(persona.id));
  const note = readOnly
    ? "This server holds no party's key, so it shows the deal as the public reads it. Open Who sees what."
    : "The server holds a testnet key for every party. Each action is still signed by the one account entitled to it.";

  const live = (
    <span className="inline-flex shrink-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-mint">
      <span className="h-1.5 w-1.5 animate-pulse rounded-pill bg-mint shadow-[0_0_8px_rgba(61,220,151,0.8)] motion-reduce:animate-none" />
      {NEAR.network}
    </span>
  );
  const mode = <span className="font-semibold text-amber">{readOnly ? "Read only." : "Demo mode."}</span>;

  return (
    <ActionFeed wording={WORDING}>
      <div className="relative min-h-screen bg-ink text-paper seated:grid seated:grid-cols-[224px_minmax(0,1fr)]">
        <AppBackground />
        <SeatKeys />
        <aside className="sticky top-0 z-40 hidden h-screen flex-col overflow-y-auto border-r border-white/10 bg-ink/75 px-4 pb-4 backdrop-blur-xl [scrollbar-width:none] seated:flex [&::-webkit-scrollbar]:hidden">
          <Link href="/" className="flex h-[52px] shrink-0 items-center" aria-label="Back to home">
            <Wordmark />
          </Link>
          <CastNav layout="column" />
          <div className="mt-3 border-t border-white/10 pt-3">
            <LensLink wide />
          </div>
          <div className="mt-auto space-y-1.5 pt-4">
            {live}
            <p className="text-[11.5px] leading-[17px] text-ash">
              {mode} {note}
            </p>
          </div>
        </aside>
        <div className="relative z-10 flex min-h-screen min-w-0 flex-col overflow-x-clip">
          <header className="border-b border-white/[0.07] bg-ink/80 seated:hidden">
            <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
              <Link href="/" className="shrink-0" aria-label="Back to home">
                <Wordmark />
              </Link>
              <span aria-hidden className="h-3.5 w-px shrink-0 bg-white/15" />
              {live}
              <p className="order-last min-w-0 basis-full text-[12.5px] leading-relaxed text-pewter lg:order-none lg:flex-1 lg:basis-auto lg:truncate">
                {mode} {note}
              </p>
              <span className="ml-auto lg:ml-0">
                <LensLink />
              </span>
            </div>
          </header>
          <div className="sticky top-0 z-40 border-b border-white/10 bg-ink/80 backdrop-blur-xl seated:hidden">
            <CastNav />
          </div>
          <main className="beside-cast mx-auto w-full max-w-[1280px] flex-1 px-6 py-12 sm:py-16">
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
