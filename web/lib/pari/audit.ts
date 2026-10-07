// SPDX-License-Identifier: Apache-2.0

import "server-only";
import { qualifiedName, witnessed, type Transaction, type TreeEvent } from "@/lib/ledger/client";
import { formatDate } from "@/lib/pari/dates";
import { CIP56 } from "@/lib/pari/ids";
import { allInRate, formatCents, formatRate, interestDueCents, toCents } from "@/lib/pari/money";
import type * as P from "@/lib/pari/types";

// The auditor's audit trail, rebuilt from the transactions it witnessed: the
// ledger's own history, as Canton's sub-transaction privacy lets the auditor
// see it. Nothing here trusts the agent's arithmetic. Each step is checked
// against what the auditor saw happen: interest is recomputed from the
// register, every payment leg against what was due, every leg against the
// cash that reached the lender, and the register against every movement of
// principal since closing.

export type Check = { label: string; ok: boolean };

/** One line of the reconciliation: what was checked, over how many steps. */
export type Finding = { label: string; detail: string; state: "ok" | "fail" | "none" };

export type Leg = { lender: string; due: bigint | null; paid: bigint };

export type TrailRow = {
  updateId: string;
  at: string;
  event: string;
  detail: string;
  /** Cents moved or requested by this step, when it has an amount. */
  amount: bigint | null;
  legs: Leg[];
  checks: Check[];
};

export type Audit = {
  /** The facility as the auditor last saw it, or null before appointment. */
  facility: P.Facility | null;
  rows: TrailRow[];
  reconciliation: Finding[];
  /** Events the auditor received, by template (`Module:Template`). */
  received: Map<string, number>;
  transactions: number;
};

const FACILITY = "Pari.Facility:Facility";
const PAYMENT_REQUEST = "Pari.Payment:PaymentRequest";
const POSITION = "Pari.Position:Position";
const HOLDING = qualifiedName(CIP56.Holding);

/** The trail of every transaction `auditor` witnessed, named with `name`. */
export async function auditTrail(auditor: string, name: (party: string) => string): Promise<Audit> {
  const transactions = await witnessed(auditor, [CIP56.Holding]);
  return reconstruct(transactions, name);
}

export function reconstruct(transactions: Transaction[], name: (party: string) => string): Audit {
  const rows: TrailRow[] = [];
  const received = new Map<string, number>();
  let facility: P.Facility | null = null;
  // Principal per lender as every movement since closing implies it.
  let implied: Map<string, bigint> | null = null;
  // Times the auditor was removed and later appointed again: what happened in
  // between is outside its view, so the replay resumes from the new register.
  let gaps = 0;

  for (const tx of transactions) {
    for (const e of tx.events) {
      const template = qualifiedName(e.templateId);
      received.set(template, (received.get(template) ?? 0) + 1);
    }
    const created = tx.events.filter(
      (e): e is Extract<TreeEvent, { kind: "created" }> => e.kind === "created" && qualifiedName(e.templateId) === FACILITY,
    );
    const next = (created.at(-1)?.payload as P.Facility | undefined) ?? null;
    const root = tx.events.find(
      (e): e is Extract<TreeEvent, { kind: "exercised" }> =>
        e.kind === "exercised" && qualifiedName(e.templateId) === FACILITY && e.choice.startsWith("Facility_"),
    );
    const row = (event: string, detail: string, amount: bigint | null, legs: Leg[] = [], checks: Check[] = []) =>
      rows.push({ updateId: tx.updateId, at: tx.effectiveAt, event, detail, amount, legs, checks });

    if (!root) {
      // Only the restated facility is visible: the auditor's appointment.
      if (next && facility === null) row("Auditor appointed", `${name(next.borrower)} appoints the auditor`, null);
      else if (next) {
        gaps += 1;
        if (implied) implied = new Map(next.register.map(([lender, entry]) => [lender, toCents(entry.principal)]));
        row(
          "Auditor reappointed",
          `${name(next.borrower)} appoints the auditor again. What happened while it was removed is outside its view; the replay resumes from this register`,
          null,
        );
      }
      facility = next ?? facility;
      continue;
    }
    const before = facility;
    const after = next;
    const inside = subtree(tx, root);

    switch (root.choice) {
      case "Facility_Close": {
        if (!after) break;
        const legs = after.register.map(([lender, entry]) => ({ lender, due: null, paid: toCents(entry.principal) }));
        const funded = sum(legs.map((l) => l.paid));
        const cash = sum(holdingsIn(inside).filter((h) => h.owner === after.borrower).map((h) => h.amount));
        implied = new Map(legs.map((l) => [l.lender, l.paid]));
        row("Closing funded", `${legs.length} lenders fund ${name(after.borrower)}`, funded, legs, [
          { label: "Funds the full commitment", ok: funded === toCents(after.terms.commitment) },
          { label: "The borrower received that cash", ok: cash === funded },
        ]);
        break;
      }
      case "Facility_FixRate": {
        const { baseRate, periodEnd } = root.argument as { baseRate: string; periodEnd: string };
        const margin = after?.terms.marginBps ?? "0";
        row(
          "Rate fixed",
          `${formatRate(baseRate)} + ${margin} bp = ${formatRate(allInRate(baseRate, margin))}, to ${formatDate(periodEnd)}`,
          null,
        );
        break;
      }
      case "Facility_RequestInterest": {
        const legs = requestedLegs(inside);
        const period = before?.period;
        const matches =
          before !== null &&
          period != null &&
          legs.every((l) => {
            const entry = before.register.find(([lender]) => lender === l.lender)?.[1];
            return entry !== undefined && interestDueCents(entry, allInRate(period.baseRate, before.terms.marginBps), period.end) === l.paid;
          }) &&
          legs.length === before.register.filter(([, e]) => toCents(e.principal) > 0n || toCents(e.carried) > 0n).length;
        row(
          "Interest requested",
          period ? `Period ${formatDate(period.start)} to ${formatDate(period.end)}` : "Interest",
          sum(legs.map((l) => l.paid)),
          legs,
          [{ label: "Each leg recomputed from the register, ACT/360", ok: matches }],
        );
        break;
      }
      case "Facility_AcceptPrepayment": {
        const legs = requestedLegs(inside);
        const total = sum(legs.map((l) => l.paid));
        const holdings = new Map(
          (before?.register ?? []).map(([lender, e]) => [lender, toCents(e.principal)] as const).filter(([, p]) => p > 0n),
        );
        const expected = proRata(total, holdings);
        row("Prepayment requested", `${name(before?.borrower ?? "")} repays principal early`, total, legs, [
          {
            label: "Shared pro rata to principal",
            ok: legs.length === expected.size && legs.every((l) => expected.get(l.lender) === l.paid),
          },
        ]);
        break;
      }
      case "Facility_Settle": {
        const { fraction } = root.argument as { fraction: string };
        const settled = inside.filter(
          (e): e is Extract<TreeEvent, { kind: "exercised" }> =>
            e.kind === "exercised" && qualifiedName(e.templateId) === POSITION && e.choice === "Position_Settle",
        );
        const legs = settled.map((e) => {
          const a = e.argument as { due: string; leg: P.TransferLeg; kind: P.PaymentKind };
          return { lender: a.leg.receiver, due: toCents(a.due), paid: toCents(a.leg.amount), kind: a.kind };
        });
        const principal = legs[0]?.kind.tag === "PrincipalPayment";
        const cash = holdingsIn(inside);
        const checks: Check[] = [
          { label: "No lender paid more than it was owed", ok: legs.every((l) => l.paid <= l.due) },
          { label: "Every lender paid the same fraction", ok: legs.every((l) => l.paid === share(l.due, fraction)) },
          {
            label: "Each leg arrived as a CIP-56 transfer, to the cent",
            ok: legs.every((l) => cash.some((h) => h.owner === l.lender && h.amount === l.paid)),
          },
        ];
        if (principal && before && after) {
          checks.push({
            label: "Register reduced by exactly what was repaid",
            ok: legs.every((l) => principalOf(before, l.lender) - l.paid === principalOf(after, l.lender)),
          });
          if (implied) for (const l of legs) implied.set(l.lender, (implied.get(l.lender) ?? 0n) - l.paid);
        }
        const fractionText = Number(fraction) === 1 ? "in full" : `${(Number(fraction) * 100).toFixed(2)}% of what was due`;
        row(
          principal ? "Principal repaid" : "Interest paid",
          `${legs.length} lenders, ${fractionText}, in one transaction`,
          sum(legs.map((l) => l.paid)),
          legs.map(({ lender, due, paid }) => ({ lender, due, paid })),
          checks,
        );
        break;
      }
      case "Facility_RecordAssignment": {
        const a = root.argument as { seller: string; buyer: string; amount: string; tradeDate: string };
        const amount = toCents(a.amount);
        const ok =
          before !== null &&
          after !== null &&
          principalOf(after, a.seller) === principalOf(before, a.seller) - amount &&
          principalOf(after, a.buyer) === principalOf(before, a.buyer) + amount &&
          total(after) === total(before);
        if (implied) {
          implied.set(a.seller, (implied.get(a.seller) ?? 0n) - amount);
          implied.set(a.buyer, (implied.get(a.buyer) ?? 0n) + amount);
        }
        row(
          "Loan assigned",
          `${name(a.seller)} to ${name(a.buyer)}, traded ${formatDate(a.tradeDate)}`,
          amount,
          [],
          [{ label: "Principal moved seller to buyer, total unchanged", ok }],
        );
        break;
      }
      case "Facility_CancelRequest":
        row("Request withdrawn", "The agent called off the open payment request", null);
        break;
      case "Facility_AppointAuditor":
        row("Auditor replaced", `${name(before?.borrower ?? "")} appoints another auditor`, null);
        break;
      case "Facility_RemoveAuditor":
        row("Auditor removed", "The auditor sees nothing new until it is appointed again", null);
        break;
      default:
        row(root.choice.replace(/^Facility_/, ""), "", null);
    }
    facility = after ?? facility;
  }

  const steps = (events: string[], pick: (c: Check) => boolean, noun: string, label: string): Finding => {
    const checked = rows.filter((r) => events.includes(r.event)).map((r) => r.checks.filter(pick));
    const passed = checked.filter((checks) => checks.length > 0 && checks.every((c) => c.ok)).length;
    if (checked.length === 0) return { label, detail: `No ${noun} yet`, state: "none" };
    return { label, detail: `${passed} of ${checked.length} ${noun}`, state: passed === checked.length ? "ok" : "fail" };
  };
  const cashCheck = (c: Check) => c.label.startsWith("Each leg");
  const lenders = facility && implied ? lendersOf(facility, implied) : [];
  const breaks = lenders.filter((lender) => (implied!.get(lender) ?? 0n) !== principalOf(facility!, lender));

  const reconciliation: Finding[] = [
    steps(["Closing funded"], () => true, "closings", "Closing funded the full commitment"),
    steps(["Interest requested"], () => true, "requests", "Interest recomputed from the register"),
    steps(["Interest paid", "Principal repaid"], (c) => !cashCheck(c), "payments", "Pro rata, and no lender overpaid"),
    steps(["Interest paid", "Principal repaid"], cashCheck, "payments", "Every leg arrived as cash, to the cent"),
    steps(["Loan assigned"], () => true, "assignments", "Assignments move principal, never create it"),
    implied === null
      ? { label: "Register replayed from closing", detail: "Needs the closing in view", state: "none" }
      : {
          label: "Register replayed from closing",
          detail: `${breaks.length} breaks across ${lenders.length} lenders${gaps > 0 ? `, resumed after ${gaps} ${gaps === 1 ? "gap" : "gaps"}` : ""}`,
          state: breaks.length === 0 ? "ok" : "fail",
        },
  ];

  return { facility, rows, reconciliation, received, transactions: transactions.length };
}

/** The events under an exercise: its consequences, in tree order. */
function subtree(tx: Transaction, root: Extract<TreeEvent, { kind: "exercised" }>): TreeEvent[] {
  return tx.events.filter((e) => e.nodeId > root.nodeId && e.nodeId <= root.lastDescendantNodeId);
}

function requestedLegs(events: TreeEvent[]): Leg[] {
  const request = events.find((e) => e.kind === "created" && qualifiedName(e.templateId) === PAYMENT_REQUEST);
  if (!request || request.kind !== "created") return [];
  const legs = Object.values((request.payload as P.PaymentRequest).legs);
  return legs.map((leg) => ({ lender: leg.receiver, due: null, paid: toCents(leg.amount) }));
}

/** CIP-56 holdings created in these events, read through the standard's view. */
function holdingsIn(events: TreeEvent[]): Array<{ owner: string; amount: bigint }> {
  return events.flatMap((e) => {
    const view = e.kind === "created" ? (e.views[HOLDING] as P.HoldingView | undefined) : undefined;
    return view ? [{ owner: view.owner, amount: toCents(view.amount) }] : [];
  });
}

function principalOf(f: P.Facility, lender: string): bigint {
  const entry = f.register.find(([l]) => l === lender)?.[1];
  return entry ? toCents(entry.principal) : 0n;
}

function total(f: P.Facility): bigint {
  return sum(f.register.map(([, e]) => toCents(e.principal)));
}

function lendersOf(f: P.Facility, implied: Map<string, bigint>): string[] {
  return [...new Set([...f.register.map(([l]) => l), ...implied.keys()])];
}

function sum(values: bigint[]): bigint {
  return values.reduce((a, b) => a + b, 0n);
}

/** floorCents(due × fraction), as the model pays a short interest leg. */
function share(due: bigint | null, fraction: string): bigint {
  if (due === null) return -1n;
  const [whole = "0", frac = ""] = fraction.split(".");
  const scaled = BigInt(whole) * 10n ** 10n + BigInt(frac.padEnd(10, "0").slice(0, 10));
  return (due * scaled) / 10n ** 10n;
}

/** The model's proRata: each share rounded down to the cent, and the
 *  leftover cents to the largest holder. */
function proRata(amount: bigint, holdings: Map<string, bigint>): Map<string, bigint> {
  const held = sum([...holdings.values()]);
  if (held === 0n) return new Map();
  const shares = new Map([...holdings].map(([lender, h]) => [lender, (amount * h) / held] as const));
  const leftover = amount - sum([...shares.values()]);
  const largest = [...holdings].reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];
  shares.set(largest, shares.get(largest)! + leftover);
  return shares;
}

/** The trail as CSV, one row per step and one more per lender leg. */
export function trailCsv(audit: Audit, name: (party: string) => string): string {
  const lines = [["time", "event", "detail", "lender", "due", "amount", "checks", "update_id"]];
  for (const row of audit.rows) {
    const checks = row.checks.map((c) => `${c.ok ? "PASS" : "FAIL"}: ${c.label}`).join("; ");
    lines.push([row.at, row.event, row.detail, "", "", row.amount === null ? "" : formatCents(row.amount), checks, row.updateId]);
    for (const leg of row.legs) {
      lines.push([row.at, row.event, "", name(leg.lender), leg.due === null ? "" : formatCents(leg.due), formatCents(leg.paid), "", row.updateId]);
    }
  }
  return lines.map((cells) => cells.map(csvCell).join(",")).join("\n") + "\n";
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
