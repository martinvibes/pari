// SPDX-License-Identifier: Apache-2.0

// Money in whole cents (bigint), matching the model's cent rounding exactly.
// Daml Decimals arrive as strings with ten fractional digits; every amount on
// Pari is a whole number of cents, so nothing here touches floating point.

/** Parses a Daml Decimal to cents, rounding down like the model's floorCents. */
export function toCents(decimal: string): bigint {
  const negative = decimal.startsWith("-");
  const [whole = "0", frac = ""] = decimal.replace(/^-/, "").split(".");
  const cents = BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2));
  return negative ? -cents : cents;
}

/** Cents as a Daml Decimal argument. */
export function toDecimal(cents: bigint): string {
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

export function formatMoney(decimal: string): string {
  return formatCents(toCents(decimal));
}

/** Compact millions for headline figures: 50000000.00 → "50M". */
export function formatMillions(decimal: string): string {
  const millions = Number(toCents(decimal)) / 100_000_000;
  return `${Number.isInteger(millions) ? millions : millions.toFixed(2)}M`;
}

/** A fraction in basis points of 1 (10000 = 100%) as a Daml Decimal. */
export function basisPointsToFraction(bp: number): string {
  return (bp / 10000).toFixed(4);
}

/** What a payer funds for one leg when paying `bp` of it: floorCents(due × fraction). */
export function shareOf(dueCents: bigint, bp: number): bigint {
  return (dueCents * BigInt(bp)) / 10000n;
}

/** The one fraction, in whole basis points, that turns every due into what was
 *  allocated against it, or null if the allocations agree on none. */
export function impliedBasisPoints(legs: Array<{ due: bigint; paid: bigint }>): number | null {
  const largest = legs.reduce<{ due: bigint; paid: bigint } | null>(
    (best, leg) => (best === null || leg.due > best.due ? leg : best),
    null,
  );
  if (largest === null || largest.due === 0n) return null;
  const estimate = Number((largest.paid * 10000n * 10n) / largest.due) / 10;
  for (const bp of [Math.round(estimate), Math.ceil(estimate), Math.floor(estimate)]) {
    if (bp > 0 && bp <= 10000 && legs.every((l) => shareOf(l.due, bp) === l.paid)) return bp;
  }
  return null;
}

/** A Daml rate Decimal as a percentage: "0.0430000000" → "4.30%". */
export function formatRate(rate: string): string {
  return `${(Number(rate) * 100).toFixed(2)}%`;
}

/** Base rate plus margin, as the model computes the all-in rate. */
export function allInRate(baseRate: string, marginBps: string): string {
  return (Number(baseRate) + Number(marginBps) / 10000).toFixed(6);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from one ISO date to another, as Daml's subDate. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

/** A non-negative Daml Decimal as an integer with `places` fractional digits. */
function scaled(decimal: string, places: number): bigint {
  const [whole = "0", frac = ""] = decimal.split(".");
  return BigInt(whole) * 10n ** BigInt(places) + BigInt(frac.padEnd(places, "0").slice(0, places));
}

/** Interest owed on a register entry for a period ending on `end`: what it
 *  carries plus ACT/360 accrual rounded down to cents, as the model's
 *  interestDue. */
export function interestDueCents(
  entry: { principal: string; accrualStart: string; carried: string },
  rate: string,
  end: string,
): bigint {
  const days = BigInt(Math.max(0, daysBetween(entry.accrualStart, end)));
  const accrued = (toCents(entry.principal) * scaled(rate, 10) * days) / (360n * 10n ** 10n);
  return toCents(entry.carried) + accrued;
}

/** A share of a whole as a percentage with two decimals: 5000 of 10000 → "50.00%". */
export function formatShare(part: bigint, whole: bigint): string {
  if (whole === 0n) return "0.00%";
  const bp = (part * 1000000n) / whole;
  return `${bp / 10000n}.${(bp % 10000n).toString().padStart(4, "0").slice(0, 2)}%`;
}

/** A trade's cash leg: par amount × price, rounded down to cents like the model. */
export function tradeCashCents(amount: string, price: string): bigint {
  return (toCents(amount) * scaled(price, 10)) / 10n ** 10n;
}

/** A price as a fraction of par, shown as a percentage: "0.995000" → "99.50". */
export function formatPrice(price: string): string {
  return (Number(price) * 100).toFixed(2);
}
