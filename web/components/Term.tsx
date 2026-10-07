// SPDX-License-Identifier: Apache-2.0

/** A contract or standard name inside running copy. Set in the mono data voice
 *  and lifted to paper so names like CIP-56 read as objects, not words. Renders a
 *  plain span (real text node), so copy and test assertions are unchanged. */
export function Term({ children }: { children: string }) {
  return <span className="font-mono text-[0.92em] text-paper">{children}</span>;
}
