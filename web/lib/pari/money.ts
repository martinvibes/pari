// SPDX-License-Identifier: Apache-2.0

// Money in whole cents (bigint). Every amount on Pari is a whole number of
// cents, so nothing here touches floating point.

/** Cents as a decimal: 98583333n → "985833.33". */
function toDecimal(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const text = `${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
  return negative ? `-${text}` : text;
}

/** Cents for display: 98583333n → "985,833.33". */
export function formatCents(cents: bigint): string {
  const [whole, frac] = toDecimal(cents).split(".");
  return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from one ISO date to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

/** A share of a whole as a percentage with two decimals: 5000 of 10000 → "50.00%". */
export function formatShare(part: bigint, whole: bigint): string {
  if (whole === 0n) return "0.00%";
  const bp = (part * 1000000n) / whole;
  return `${bp / 10000n}.${(bp % 10000n).toString().padStart(4, "0").slice(0, 2)}%`;
}
