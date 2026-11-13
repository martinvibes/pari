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

// The visitor's own account: the one seat the demo server does not sign for.
const YOU = { href: "/you", hue: "#3DDC97", key: "0" };

// Each party keeps its place at the table as its number key: 1 is the agent.
const CAST = PERSONAS.map((p, i) => ({ ...p, hue: hueOf(p.id), key: String(i + 1) }));

const GLIDE = "duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

// What each group does in the deal, said over its seats.
const CAPTION: Record<Seat, string> = {
  agent: "Runs the loan",
  borrower: "Borrower",
  lender: "Lenders",
  buyer: "Buyers",
  auditor: "Checks the books",
};

const CAPTION_CLASS = "text-[10px] font-semibold uppercase tracking-[0.18em]";

/** Number keys switch screens: 1 to 8 down the cast, 9 for the lens, and 0 for
 *  the visitor's own seat where there is one. Typing in a form, or any chord
 *  with a modifier, is left alone. Mounted once, whichever way the table is
 *  laid out. */
export function SeatKeys({ near }: { near: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    for (const href of [...CAST.map((p) => p.href), LENS.href]) router.prefetch(href);
  }, [router]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const href =
        event.key === LENS.key ? LENS.href : near && event.key === YOU.key ? YOU.href : CAST.find((p) => p.key === event.key)?.href;
      if (href && href !== pathname) router.push(href);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathname, router, near]);

  return null;
}

/** One place card: the party's disc in its own hue, and its name. The card of
 *  the open screen is lit in that hue and says what the party is. */
function PlaceCard({
  href,
  name,
  role,
  hue,
  hint,
  title,
  on,
  open = false,
  wide = false,
  children,
}: {
  href: string;
  name: string;
  role: string;
  hue: string;
  hint: string;
  title: string;
  on: boolean;
  /** An empty chair: dashed, and its role always shown. */
  open?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const idle = open
    ? "border-dashed border-mint/40 bg-mint/[0.04] text-mint hover:border-mint/80 hover:text-paper"
    : "border-white/10 bg-white/[0.025] text-smoke hover:border-white/30 hover:text-paper";
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      aria-keyshortcuts={hint}
      title={title}
      className={`group relative flex shrink-0 items-center gap-2.5 border pl-2 pr-4 transition ${GLIDE} ${wide ? "h-9 w-full" : "h-12"} ${
        on ? "text-paper" : `${idle} ${wide ? "hover:translate-x-0.5" : "hover:-translate-y-0.5"}`
      }`}
      style={
        on
          ? {
              borderColor: `${hue}8C`,
              background: `linear-gradient(180deg, ${hue}2B, ${hue}0F)`,
              boxShadow: `0 0 28px ${hue}2E, inset 0 1px 0 ${hue}40`,
            }
          : undefined
      }
    >
      <span
        aria-hidden
        className={`grid shrink-0 place-items-center rounded-pill font-semibold transition ${GLIDE} ${wide ? "h-6 w-6 text-[11.5px]" : "h-8 w-8 text-[13px]"}`}
        style={
          on
            ? { background: hue, color: "#000000", boxShadow: `0 0 16px ${hue}99` }
            : { background: `${hue}1F`, color: hue, boxShadow: `inset 0 0 0 1px ${hue}59` }
        }
      >
        {children}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={`whitespace-nowrap text-[14px] font-medium ${wide ? "leading-4" : "leading-[18px]"}`}>{name}</span>
        <span
          className={`overflow-hidden whitespace-nowrap text-[11.5px] transition-all ${wide ? "leading-[14px]" : "leading-4"} ${GLIDE} ${
            on || open ? "max-h-4 max-w-[180px] opacity-100" : "max-h-0 max-w-0 opacity-0"
          } ${on ? "text-smoke" : "text-ash"}`}
        >
          {role}
        </span>
      </span>
      <span
        aria-hidden
        className={`absolute right-1.5 top-1 text-[9.5px] font-semibold leading-none tabular-nums ${on ? "text-paper/70" : "text-graphite group-hover:text-ash"}`}
      >
        {hint}
      </span>
    </Link>
  );
}

function Person() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4" />
    </svg>
  );
}

/** The deal's cast as place cards at a table, seated by role: who runs the
 *  loan, the borrower, the lenders, the buyers and the auditor. On NEAR one
 *  more chair stands open: the visitor's own account, the only seat the demo
 *  server does not sign for. The table runs down the side of a wide page
 *  (`column`) and along the top of a narrow one (`row`). */
export function CastNav({ near, layout = "row" }: { near: boolean; layout?: "row" | "column" }) {
  const pathname = usePathname();
  const table = useRef<HTMLDivElement>(null);
  const column = layout === "column";

  // On a narrow table, bring the open seat into view.
  useEffect(() => {
    const row = table.current;
    const current = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !current || row.scrollWidth <= row.clientWidth) return;
    row.scrollTo({ left: current.offsetLeft - (row.clientWidth - current.offsetWidth) / 2, behavior: "smooth" });
  }, [pathname]);

  const groups = SEATS.map((group) => (
    <div key={group.seat} role="group" aria-label={group.label} className="shrink-0">
      <p className={`${CAPTION_CLASS} text-graphite ${column ? "mb-1" : "mb-2"}`}>{CAPTION[group.seat]}</p>
      <div className={column ? "space-y-1" : "flex gap-1.5"}>
        {CAST.filter((p) => p.seat === group.seat).map((p) => (
          <PlaceCard
            key={p.id}
            href={p.href}
            name={p.name}
            role={near && p.seat === "lender" ? "Lender" : p.blurb}
            hue={p.hue}
            hint={p.key}
            title={`Sit as ${p.name} · press ${p.key}`}
            on={p.href === pathname}
            wide={column}
          >
            {p.name.charAt(0)}
          </PlaceCard>
        ))}
      </div>
    </div>
  ));

  const you = near ? (
    <div role="group" aria-label="Your own account" className={column ? "shrink-0" : "ml-auto shrink-0 border-l border-white/10 pl-5"}>
      <p className={`${CAPTION_CLASS} text-mint/80 ${column ? "mb-1" : "mb-2"}`}>An open seat</p>
      <PlaceCard
        href={YOU.href}
        name="You"
        role="Your own account"
        hue={YOU.hue}
        hint={YOU.key}
        title={`Sign in and buy into the loan with an account only you control · press ${YOU.key}`}
        on={pathname === YOU.href}
        open
        wide={column}
      >
        <Person />
      </PlaceCard>
    </div>
  ) : null;

  if (column) {
    return (
      <nav aria-label="Seats at the deal" className="space-y-2">
        {groups}
        {you}
      </nav>
    );
  }

  return (
    <nav aria-label="Seats at the deal" className="mx-auto max-w-[1280px] px-4 sm:px-6">
      <div ref={table} className="flex items-end gap-5 overflow-x-auto py-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {groups}
        {you}
      </div>
    </nav>
  );
}

/** The privacy matrix, as a lens over the whole cast. */
export function LensLink({ wide = false }: { wide?: boolean }) {
  const on = usePathname() === LENS.href;
  return (
    <Link
      href={LENS.href}
      aria-current={on ? "page" : undefined}
      aria-keyshortcuts={LENS.key}
      title={`Every party's own view, side by side · press ${LENS.key}`}
      className={`group flex shrink-0 items-center gap-2 whitespace-nowrap rounded-pill border px-3.5 py-2 text-[13px] font-semibold uppercase tracking-[0.1em] transition ${GLIDE} ${
        wide ? "w-full justify-center" : ""
      } ${on ? "border-iris/60 bg-iris/15 text-paper" : "border-white/15 text-smoke hover:border-iris/50 hover:text-paper"}`}
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
