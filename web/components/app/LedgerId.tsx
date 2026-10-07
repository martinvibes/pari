// SPDX-License-Identifier: Apache-2.0

"use client";

import { useState } from "react";

/** Ledger ids are long; the head and tail are what people compare. A party id
 *  (`Alder-x1::1220ab…`) keeps its readable hint and shortens the fingerprint. */
export function shortId(id: string): string {
  const [hint, fingerprint] = id.split("::");
  if (fingerprint !== undefined) return `${hint}::${fingerprint.slice(0, 8)}…${fingerprint.slice(-4)}`;
  return id.length > 22 ? `${id.slice(0, 12)}…${id.slice(-6)}` : id;
}

/** A ledger id (an update id or a party id), shortened, with the full id one
 *  click away. */
export function LedgerId({ id, className = "" }: { id: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused (insecure origin): the id stays selectable.
    }
  }
  return (
    <span className={`flex items-center justify-between gap-3 ${className}`}>
      <span className="min-w-0 truncate font-mono text-[12px] text-smoke" title={id}>
        {shortId(id)}
      </span>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-ash transition hover:text-paper"
      >
        {copied ? <span className="text-mint">Copied</span> : "Copy"}
      </button>
    </span>
  );
}
