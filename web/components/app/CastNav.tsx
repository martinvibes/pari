// SPDX-License-Identifier: Apache-2.0

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect } from "react";
import { hueOf } from "@/components/app/party";
import { PERSONAS, SEATS } from "@/lib/pari/personas";
import { useSlideRect } from "@/lib/useSlideRect";

// The privacy matrix is a lens on every party, not a party, so it sits apart
// from the cast and wears the privacy colour (iris).
const LENS = { href: "/visibility", label: "Who sees what", hue: "#A78BFA", key: "9" };

// Each party keeps its place in the rail as its number key: 1 is the agent.
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

/** The deal's cast as one rail, seated by role: the agent, the borrower, the
 *  lenders, the buyers and the auditor, each group set off by a hairline and
 *  named where its parties go by their own names. A single pill in the active
 *  party's hue glides to whichever screen is open, with a static pill before
 *  measurement (server render, no JS). */
export function CastNav() {
  const pathname = usePathname();
  const { containerRef, rect } = useSlideRect<HTMLDivElement>('[aria-current="page"]', pathname);
  const active = CAST.find((p) => p.href === pathname);
  useSeatKeys(pathname);

  // On a narrow rail, bring the open party into view.
  useEffect(() => {
    const rail = containerRef.current;
    const current = rail?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!rail || !current || rail.scrollWidth <= rail.clientWidth) return;
    rail.scrollTo({ left: current.offsetLeft - (rail.clientWidth - current.offsetWidth) / 2, behavior: "smooth" });
  }, [pathname, containerRef]);

  return (
    <div
      ref={containerRef}
      className="relative flex max-w-full items-center overflow-x-auto rounded-pill border border-white/10 bg-white/[0.03] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {rect && active ? (
        <span
          aria-hidden
          className={`absolute rounded-pill transition-all ${GLIDE}`}
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            background: `${active.hue}24`,
            boxShadow: `inset 0 0 0 1px ${active.hue}66, 0 0 22px ${active.hue}2E`,
          }}
        />
      ) : null}

      {SEATS.map((group, index) => {
        const members = CAST.filter((p) => p.seat === group.seat);
        // "Agent" and "Auditor" are their own role; proper names need one.
        const named = members.some((p) => p.name !== group.label);
        return (
          <Fragment key={group.seat}>
            {index > 0 ? <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-white/10" /> : null}
            <div role="group" aria-label={group.label} className="flex shrink-0 items-center">
              {named ? (
                <span className="hidden pl-2.5 pr-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-graphite xl:inline">
                  {group.label}
                </span>
              ) : null}
              {members.map((p) => {
                const on = p.href === pathname;
                return (
                  <Link
                    key={p.id}
                    href={p.href}
                    aria-current={on ? "page" : undefined}
                    aria-keyshortcuts={p.key}
                    title={`${p.blurb} · press ${p.key}`}
                    className={`group relative flex items-center gap-2 whitespace-nowrap rounded-pill px-3 py-1.5 text-[14px] font-medium transition-colors ${GLIDE} ${
                      on ? "text-paper" : "text-ash hover:text-paper"
                    }`}
                    style={on && !rect ? { background: `${p.hue}24`, boxShadow: `inset 0 0 0 1px ${p.hue}66` } : undefined}
                  >
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 shrink-0 rounded-pill transition ${GLIDE} ${
                        on ? "scale-125" : "opacity-60 group-hover:opacity-100"
                      }`}
                      style={{ background: p.hue, boxShadow: on ? `0 0 10px ${p.hue}` : undefined }}
                    />
                    {p.name}
                  </Link>
                );
              })}
            </div>
          </Fragment>
        );
      })}
    </div>
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
