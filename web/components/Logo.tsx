// SPDX-License-Identifier: Apache-2.0

import { MARK_PATH } from "@/lib/mark";

/** Pari mark: two parallel strokes, for pari passu, lenders ranking equally. */
export function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d={MARK_PATH} fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <Logo />
      <span className="text-lg font-semibold tracking-tight">pari</span>
    </span>
  );
}
