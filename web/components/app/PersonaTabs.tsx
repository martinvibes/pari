// SPDX-License-Identifier: Apache-2.0

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PERSONAS } from "@/lib/pari/personas";
import { useSlideRect } from "@/lib/useSlideRect";

const TABS = [
  ...PERSONAS.map((p) => ({ href: p.href, label: p.name })),
  { href: "/visibility", label: "Visibility" },
];

/** One tab per party in the deal, plus the visibility matrix. The active tab
 *  is the one live signal here, so it carries the accent; its underline is a
 *  single measured element that slides between tabs, with a static underline
 *  before measurement (server render, no JS). */
export function PersonaTabs() {
  const pathname = usePathname();
  const { containerRef, rect } = useSlideRect<HTMLUListElement>('[aria-current="page"]', pathname);

  return (
    <ul
      ref={containerRef}
      className="relative col-span-3 row-start-2 flex w-full flex-nowrap items-center justify-start gap-x-5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:col-auto sm:row-auto sm:w-auto sm:flex-1 sm:justify-center sm:gap-x-7 sm:pb-0"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <li key={tab.href}>
            <Link
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? `glow-signal relative pb-1 text-[13px] uppercase tracking-[0.12em] text-amber ${
                      rect
                        ? ""
                        : "after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-amber after:shadow-[0_0_8px_rgba(255,172,46,0.55)]"
                    }`
                  : "pb-1 text-[13px] uppercase tracking-[0.12em] text-smoke transition hover:text-paper"
              }
            >
              {tab.label}
            </Link>
          </li>
        );
      })}
      {rect ? (
        <span
          aria-hidden
          className="absolute h-px bg-amber shadow-[0_0_8px_rgba(255,172,46,0.55)] transition-all duration-300 ease-out motion-reduce:transition-none"
          style={{ left: rect.left, top: rect.top + rect.height - 1, width: rect.width }}
        />
      ) : null}
    </ul>
  );
}
