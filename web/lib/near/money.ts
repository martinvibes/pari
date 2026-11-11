// SPDX-License-Identifier: Apache-2.0

import { daysBetween, formatCents } from "@/lib/pari/money";

// The NEAR books keep money as whole cents in decimal strings, rates in basis
// points and prices in parts per million of par. Nothing here uses floats for
// money.

/** Cents from the books: "98583333" → 98583333n. */
export function cents(text: string | null | undefined): bigint {
  return text ? BigInt(text) : 0n;
}

/** Cents for display: "98583333" → "985,833.33". */
export function showCents(text: string | null | undefined): string {
  return formatCents(cents(text));
}

/** What a person typed as an amount, in cents: "1,971,666.66" → 197166666n. */
export function parseCents(text: string, what: string): bigint {
  const clean = text.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) throw new Error(`Enter ${what} as an amount, like 1,971,666.66.`);
  const [whole = "0", frac = ""] = clean.split(".");
  const value = BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0"));
  if (value <= 0n) throw new Error(`Enter ${what} above zero.`);
  return value;
}

/** A percentage a person typed, in hundredths of a percent: "4.30" → 430. */
export function parseBasisPoints(text: string, what: string): number {
  const clean = text.replace(/[%\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) throw new Error(`Enter ${what} as a percentage, like 4.30.`);
  const [whole = "0", frac = ""] = clean.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/** Basis points as a percentage: 780 → "7.80%". */
export function showRate(bps: number): string {
  return `${Math.floor(bps / 100)}.${(bps % 100).toString().padStart(2, "0")}%`;
}

/** A price in parts per million of par, as a percentage of par: 995000 → "99.50". */
export function showPrice(ppm: number): string {
  return (ppm / 10_000).toFixed(2);
}

/** Interest owed on a register line for a period ending on `end`: what it
 *  carries plus ACT/360 accrual rounded down to cents, as the enclave computes it. */
export function interestDue(entry: { principal: string; accrual_start: string; carried: string }, rateBps: number, end: string): bigint {
  const days = BigInt(Math.max(0, daysBetween(entry.accrual_start, end)));
  return cents(entry.carried) + (cents(entry.principal) * BigInt(rateBps) * days) / (10_000n * 360n);
}
