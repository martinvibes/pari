// SPDX-License-Identifier: Apache-2.0

// Daml Dates are ISO `YYYY-MM-DD` strings, so they compare and sort as text.

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
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

/** A ledger timestamp as "2 Oct 2026, 14:03 UTC". */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${formatDate(d.toISOString())}, ${time} UTC`;
}
