// SPDX-License-Identifier: Apache-2.0

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hueOf } from "@/components/app/party";
import { PERSONAS } from "@/lib/pari/personas";
import { useSlideRect } from "@/lib/useSlideRect";

const TABS = [
  ...PERSONAS.map((p) => ({ href: p.href, label: p.name, hue: hueOf(p.id) })),
  // The privacy matrix wears the privacy colour (iris).
  { href: "/visibility", label: "Visibility", hue: "#A78BFA" },
];

/** One tab per party in the deal, plus the visibility matrix. Each tab carries
 *  its party's identity dot, and the active tab lights up in that hue. Its
 *  underline is a single measured element that slides between tabs and
 *  shifts colour as it goes, with a static underline before measurement
 *  (server render, no JS). */
export function PersonaTabs() {
  const pathname = usePathname();
  const { containerRef, rect } = useSlideRect<HTMLUListElement>('[aria-current="page"]', pathname);
  const activeHue = TABS.find((tab) => tab.href === pathname)?.hue;

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
              className={`group relative flex items-center gap-2 pb-1 text-[13px] font-semibold uppercase tracking-[0.12em] transition ${
                active
                  ? `${rect ? "" : "after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-current"}`
                  : "text-ash hover:text-paper"
              }`}
              style={active ? { color: tab.hue, textShadow: `0 0 10px ${tab.hue}73` } : undefined}
            >
              <span
                aria-hidden
                className={`h-1.5 w-1.5 shrink-0 rounded-pill transition ${active ? "" : "opacity-60 group-hover:opacity-100"}`}
                style={{ background: tab.hue, boxShadow: active ? `0 0 8px ${tab.hue}` : undefined }}
              />
              {tab.label}
            </Link>
          </li>
        );
      })}
      {rect ? (
        <span
          aria-hidden
          className="absolute h-px transition-all duration-300 ease-out motion-reduce:transition-none"
          style={{
            left: rect.left,
            top: rect.top + rect.height - 1,
            width: rect.width,
            background: activeHue,
            boxShadow: `0 0 8px ${activeHue}`,
          }}
        />
      ) : null}
    </ul>
  );
}
