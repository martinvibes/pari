// SPDX-License-Identifier: Apache-2.0

"use client";

import { useFormStatus } from "react-dom";
import { shareProof } from "@/app/(app)/near-actions";

/** Cuts the proof of one fact (`position`, `cash`, `payments.0`) from the
 *  persona's own envelope and opens the page that checks it. */
export function Prove({ persona, item, label = "Prove", variant = "ghost" }: { persona: string; item: string; label?: string; variant?: "solid" | "ghost" }) {
  return (
    <form action={shareProof}>
      <input type="hidden" name="persona" value={persona} />
      <input type="hidden" name="item" value={item} />
      <Submit label={label} solid={variant === "solid"} />
    </form>
  );
}

function Submit({ label, solid }: { label: string; solid: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={solid ? "btn-solid" : "btn-ghost"}>
      {pending ? <span aria-hidden className={`h-3 w-3 animate-spin rounded-pill border ${solid ? "border-ink/40 border-t-ink" : "border-white/30 border-t-paper"}`} /> : null}
      {label}
    </button>
  );
}
