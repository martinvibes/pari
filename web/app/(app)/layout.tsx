// SPDX-License-Identifier: Apache-2.0

import { PageTransition } from "@/components/PageTransition";
import { ActionFeed, type FeedWording } from "@/components/app/ActionFeed";
import { Shell } from "@/components/app/Shell";
import { BACKEND } from "@/lib/backend";
import { LEDGER } from "@/lib/ledger/config";
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

// On NEAR every action runs the books inside the enclave before the contract
// answers, so the receipt says what the wait is for.
const NEAR_WORDING: FeedWording = {
  pending: "Sent to NEAR",
  waiting: "The contract is running the books in the enclave and checking the answer. On testnet this takes from ten seconds to two minutes.",
  refused: "Refused",
  unchanged: "Nothing changed: the books and the money are as they were.",
};

// Chrome for the working app: beside every screen, the seat you are sitting in
// and the places you can go, kept apart (components/app/Shell.tsx). The
// `.app` class scopes the app's own restatement of the shared styles.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const near = BACKEND === "near";
  const readOnly = near && !PERSONAS.every((persona) => holdsKeysFor(persona.id));
  return (
    <ActionFeed wording={near ? NEAR_WORDING : undefined}>
      <div className="app min-h-screen bg-carbon text-[14px] text-smoke lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
        <Shell near={near} readOnly={readOnly} network={near ? NEAR.network : LEDGER.network} repo={SITE.repo} />
        <main className="min-w-0 pb-14 lg:pb-0">
          {/* A NEAR screen frames itself (components/app/Screen.tsx); a Canton screen is given the same gutters. */}
          <PageTransition>{near ? children : <div className="max-w-[1240px] space-y-6 px-5 py-[22px] sm:px-7">{children}</div>}</PageTransition>
        </main>
      </div>
    </ActionFeed>
  );
}
