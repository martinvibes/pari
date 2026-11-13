// SPDX-License-Identifier: Apache-2.0

// Deal dates are ISO `YYYY-MM-DD` strings, so they compare and sort as text.

export function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function clampDate(date: string, min: string, max: string): string {
  return date < min ? min : date > max ? max : date;
}

/** "2026-12-15" → "15 Dec 2026". */
export function formatDate(date: string): string {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
