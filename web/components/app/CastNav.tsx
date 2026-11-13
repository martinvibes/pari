// SPDX-License-Identifier: Apache-2.0

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { hueOf } from "@/components/app/party";
import { PERSONAS, SEATS, type Seat } from "@/lib/pari/personas";

// The privacy matrix is a lens on every party, not a party, so it sits apart
// from the cast and wears the privacy colour (iris).
const LENS = { href: "/visibility", label: "Who sees what", hue: "#A78BFA", key: "9" };

// Each party keeps its place at the table as its number key: 1 is the agent.
const CAST = PERSONAS.map((p, i) => ({ ...p, hue: hueOf(p.id), key: String(i + 1) }));

const GLIDE = "duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

/** Number keys switch screens: 1 to 8 down the cast, 9 for the lens. Typing in
 *  a form, or any chord with a modifier, is left alone. */
function useSeatKeys(pathname: string) {
  const router = useRouter();

  useEffect(() => {
    for (const href of [...CAST.map((p) => p.href), LENS.href]) router.prefetch(href);
  }, [router]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const href = event.key === LENS.key ? LENS.href : CAST.find((p) => p.key === event.key)?.href;
      if (href && href !== pathname) router.push(href);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathname, router]);
}

// What each group does in the deal, said over its seats.
const CAPTION: Record<Seat, string> = {
  agent: "Runs the loan",
  borrower: "Borrower",
  lender: "Lenders",
  buyer: "Buyers",
  auditor: "Checks the books",
};

/** The deal's cast as place cards at a table, seated by role: who runs the
 *  loan, the borrower, the lenders, the buyers and the auditor. Each card is
 *  one party, with its disc in its own hue. The card of the open screen is lit
 *  in that hue and says what the party is; the others carry the name alone. */
export function CastNav({ near }: { near: boolean }) {
  const pathname = usePathname();
  const table = useRef<HTMLDivElement>(null);
  const seated = CAST.some((p) => p.href === pathname);
  useSeatKeys(pathname);

  // On a narrow table, bring the open seat into view.
  useEffect(() => {
    const row = table.current;
    const current = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !current || row.scrollWidth <= row.clientWidth) return;
    row.scrollTo({ left: current.offsetLeft - (row.clientWidth - current.offsetWidth) / 2, behavior: "smooth" });
  }, [pathname]);

  return (
    <nav aria-label="Seats at the deal" className="mx-auto flex max-w-[1280px] items-end gap-7 px-4 sm:px-6">
      <div className="hidden w-[150px] shrink-0 pb-3.5 xl:block">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-paper">{seated ? "Sitting as" : "Take a seat"}</p>
        <p className="mt-1 text-[12.5px] leading-snug text-ash">Each seat sees only its own side of the deal.</p>
      </div>
      <div
        ref={table}
        className="flex min-w-0 flex-1 items-end gap-5 overflow-x-auto py-3.5 [scrollbar-width:none] xl:justify-between [&::-webkit-scrollbar]:hidden"
      >
        {SEATS.map((group) => (
          <div key={group.seat} role="group" aria-label={group.label} className="shrink-0">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-graphite">{CAPTION[group.seat]}</p>
            <div className="flex gap-1.5">
              {CAST.filter((p) => p.seat === group.seat).map((p) => {
                const on = p.href === pathname;
                return (
                  <Link
                    key={p.id}
                    href={p.href}
                    aria-current={on ? "page" : undefined}
                    aria-keyshortcuts={p.key}
                    title={`Sit as ${p.name} · press ${p.key}`}
                    className={`group relative flex h-12 shrink-0 items-center gap-2.5 border pl-2 pr-4 transition ${GLIDE} ${
                      on ? "text-paper" : "border-white/10 bg-white/[0.025] text-smoke hover:-translate-y-0.5 hover:border-white/30 hover:text-paper"
                    }`}
                    style={
                      on
                        ? {
                            borderColor: `${p.hue}8C`,
                            background: `linear-gradient(180deg, ${p.hue}2B, ${p.hue}0F)`,
                            boxShadow: `0 0 28px ${p.hue}2E, inset 0 1px 0 ${p.hue}40`,
                          }
                        : undefined
                    }
                  >
                    <span
                      aria-hidden
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-pill text-[13px] font-semibold transition ${GLIDE}`}
                      style={
                        on
                          ? { background: p.hue, color: "#000000", boxShadow: `0 0 16px ${p.hue}99` }
                          : { background: `${p.hue}1F`, color: p.hue, boxShadow: `inset 0 0 0 1px ${p.hue}59` }
                      }
                    >
                      {p.name.charAt(0)}
                    </span>
                    <span className="flex flex-col">
                      <span className="whitespace-nowrap text-[14px] font-medium leading-[18px]">{p.name}</span>
                      <span
                        className={`overflow-hidden whitespace-nowrap text-[11.5px] leading-4 text-smoke transition-all ${GLIDE} ${
                          on ? "max-h-4 max-w-[180px] opacity-100" : "max-h-0 max-w-0 opacity-0"
                        }`}
                      >
                        {near && p.seat === "lender" ? "Lender" : p.blurb}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className={`absolute right-1.5 top-1 text-[9.5px] font-semibold leading-none tabular-nums ${on ? "text-paper/70" : "text-graphite group-hover:text-ash"}`}
                    >
                      {p.key}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}

/** The visitor's own account: the one screen the demo server does not sign
 *  for. It sits in the status line, next to the sentence it is the exception to. */
export function YouLink() {
  const on = usePathname() === "/you";
  return (
    <Link
      href="/you"
      aria-current={on ? "page" : undefined}
      title="Sign in and buy into the loan with an account only you control"
      className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-pill border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] transition ${GLIDE} ${
        on ? "border-mint/60 bg-mint/15 text-paper" : "border-mint/30 bg-mint/[0.06] text-mint hover:border-mint/60 hover:text-paper"
      }`}
    >
      Use your own account
      <span aria-hidden>→</span>
    </Link>
  );
}

/** The privacy matrix, as a lens over the whole cast. */
export function LensLink() {
  const on = usePathname() === LENS.href;
  return (
    <Link
      href={LENS.href}
      aria-current={on ? "page" : undefined}
      aria-keyshortcuts={LENS.key}
      title={`Every party's own view, side by side · press ${LENS.key}`}
      className={`group flex shrink-0 items-center gap-2 whitespace-nowrap rounded-pill border px-3.5 py-2 text-[13px] font-semibold uppercase tracking-[0.1em] transition ${GLIDE} ${
        on ? "border-iris/60 bg-iris/15 text-paper" : "border-white/15 text-smoke hover:border-iris/50 hover:text-paper"
      }`}
      style={on ? { boxShadow: `0 0 22px ${LENS.hue}33` } : undefined}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className={`h-4 w-4 transition ${on ? "text-iris" : "text-ash group-hover:text-iris"}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      {LENS.label}
    </Link>
  );
}
