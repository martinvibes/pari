// SPDX-License-Identifier: Apache-2.0

"use client";

import { useFormStatus } from "react-dom";
import { shareProof } from "@/app/(app)/near-actions";

/** Cuts the proof of one fact (`position`, `cash`, `payments.0`) from the
 *  persona's own envelope and opens the page that checks it. */
export function Prove({ persona, item, label = "Prove" }: { persona: string; item: string; label?: string }) {
  return (
    <form action={shareProof}>
      <input type="hidden" name="persona" value={persona} />
      <input type="hidden" name="item" value={item} />
      <Submit label={label} />
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-ghost">
      {pending ? <span aria-hidden className="h-3 w-3 animate-spin rounded-pill border border-white/30 border-t-paper" /> : null}
      {label}
    </button>
  );
}
