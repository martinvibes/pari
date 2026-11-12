// SPDX-License-Identifier: Apache-2.0

"use client";

import { usePathname } from "next/navigation";
import { hueOf } from "@/components/app/party";
import { PERSONAS } from "@/lib/pari/personas";

// Shown while a screen reads the books as its party, which takes a second or
// two: who is being read, a beam in that party's hue, and the screen's shape
// in skeleton, so a seat switch never sits on the old screen.
export default function Loading() {
  const pathname = usePathname();
  const persona = PERSONAS.find((p) => p.href === pathname);
  const hue = persona ? hueOf(persona.id) : "#8E8E96";

  return (
    <div aria-busy="true">
      <div className="flex h-14 items-center gap-2.5 border-b border-white/[0.08] px-5 text-[13.5px] text-smoke sm:px-7">
        <span aria-hidden className="h-2 w-2 animate-pulse rounded-pill motion-reduce:animate-none" style={{ background: hue }} />
        {persona ? `Opening ${persona.name}'s books` : "Reading the chain"}
      </div>
      <div className="beam h-px bg-white/[0.06]" style={{ color: hue }} />
      <div className="max-w-[1120px] space-y-6 px-5 py-[22px] sm:px-7">
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 border-b border-white/[0.08] pb-[18px] lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <span className="skeleton block h-3 w-20" />
              <span className="skeleton block h-4 w-32" />
            </div>
          ))}
        </div>
        <div className="h-64 border border-white/[0.17] bg-coal" />
        <div className="space-y-3">
          <span className="skeleton block h-4 w-28" />
          {[0, 1, 2].map((i) => (
            <span key={i} className="skeleton block h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
