// SPDX-License-Identifier: Apache-2.0

"use client";

import { usePathname } from "next/navigation";
import { hueOf } from "@/components/app/party";
import { PERSONAS } from "@/lib/pari/personas";

// Shown while a screen reads the ledger as its party, which on DevNet takes a
// second or two: who is being read, a beam in that party's hue, and the
// screen's shape in skeleton, so a tab switch never sits on the old screen.
export default function Loading() {
  const pathname = usePathname();
  const persona = PERSONAS.find((p) => p.href === pathname);
  const hue = persona ? hueOf(persona.id) : "#A78BFA";

  return (
    <div className="space-y-12" aria-busy="true">
      <div className="space-y-5">
        <p className="label-data flex items-center gap-2.5" style={{ color: hue }}>
          <span
            aria-hidden
            className="h-2 w-2 animate-pulse rounded-pill motion-reduce:animate-none"
            style={{ background: hue, boxShadow: `0 0 10px ${hue}` }}
          />
          Reading the ledger as {persona ? persona.name : "every party"}
        </p>
        <div className="beam h-[2px] w-72 max-w-full bg-white/[0.06]" style={{ color: hue }} />
        <span className="skeleton h-16 w-80 max-w-full" />
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-4 border-t border-white/15 px-1 pt-4">
            <span className="skeleton h-3 w-24" />
            <span className="skeleton block h-8 w-40" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="card h-80 lg:col-span-7" />
        <div className="card h-80 lg:col-span-5" />
      </div>
    </div>
  );
}
