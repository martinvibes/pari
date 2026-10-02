// SPDX-License-Identifier: Apache-2.0

import "server-only";
import type { Contract } from "@/lib/ledger/client";
import { formatDate } from "@/lib/pari/dates";
import { impliedBasisPoints, toCents } from "@/lib/pari/money";
import type { Snapshot } from "@/lib/pari/snapshot";
import type * as P from "@/lib/pari/types";

// Read-side helpers over a snapshot: the deal's facility, its open request
// and how far it is funded, and each trade's readiness to settle.

export const DEAL_ID = "NORTHWIND-TLB-2026";

export function facilityOf(s: Snapshot): Contract<P.Facility> | null {
  return s.facilities.find((f) => f.payload.terms.facilityId === DEAL_ID) ?? null;
}

export function outstandingCents(facility: P.Facility): bigint {
  return facility.register.reduce((sum, [, entry]) => sum + toCents(entry.principal), 0n);
}

export function allocationFor(s: Snapshot, settlementRef: string, legId: string) {
  return s.allocations.find(
    (a) =>
      a.payload.allocation.settlement.settlementRef.id === settlementRef &&
      a.payload.allocation.transferLegId === legId,
  );
}

export type RequestLeg = {
  legId: string;
  lender: string;
  due: bigint;
  allocation: Contract<P.AllocationView> | undefined;
};

export type RequestState = {
  request: Contract<P.PaymentRequest>;
  legs: RequestLeg[];
  /** The common fraction every allocation pays, in basis points, once all legs are funded. */
  fundedBp: number | null;
};

export function requestState(s: Snapshot, facility: P.Facility): RequestState | null {
  const request = s.requests.find((r) => r.contractId === facility.pending);
  if (!request) return null;
  const legs = Object.entries(request.payload.legs)
    .map(([legId, leg]) => ({
      legId,
      lender: leg.receiver,
      due: toCents(leg.amount),
      allocation: allocationFor(s, request.payload.settlement.settlementRef.id, legId),
    }))
    .sort((a, b) => (a.due > b.due ? -1 : 1));
  const funded = legs.filter((l) => l.allocation);
  const fundedBp =
    funded.length === 0
      ? null
      : impliedBasisPoints(
          legs.map((l) => ({ due: l.due, paid: l.allocation ? toCents(l.allocation.payload.allocation.transferLeg.amount) : 0n })),
        );
  return { request, legs, fundedBp };
}

/** The trade ticket's cash leg id, as the model names it. */
export const TRADE_LEG_ID = "cash";

/** The buyer's cash allocation for a trade ticket, once funded. Tickets with
 *  the same trade date share a settlement reference, so match the sender too. */
export function tradeAllocation(s: Snapshot, ticket: P.TradeTicket) {
  return s.allocations.find(
    (a) =>
      a.payload.allocation.settlement.settlementRef.id === ticket.settlement.settlementRef.id &&
      a.payload.allocation.transferLegId === TRADE_LEG_ID &&
      a.payload.allocation.transferLeg.sender === ticket.buyer,
  );
}

export function paymentLabel(kind: P.PaymentKind): string {
  return kind.tag === "InterestPayment" ? `Interest to ${formatDate(kind.value.period.end)}` : "Principal prepayment";
}

export function positionOf(s: Snapshot, lender: string) {
  return s.positions.find((p) => p.payload.lender === lender && p.payload.facilityId === DEAL_ID);
}

export function latestScreening(s: Snapshot, candidate: string) {
  return s.screenings
    .filter((r) => r.payload.candidate === candidate && r.payload.facilityId === DEAL_ID)
    .sort((a, b) => (a.payload.screenedAt < b.payload.screenedAt ? 1 : -1))[0];
}

export function balanceCents(s: Snapshot, owner: string, instrument: P.InstrumentId): bigint {
  return s.holdings
    .filter(
      (h) =>
        h.payload.owner === owner &&
        h.payload.lock === null &&
        h.payload.instrumentId.admin === instrument.admin &&
        h.payload.instrumentId.id === instrument.id,
    )
    .reduce((sum, h) => sum + toCents(h.payload.amount), 0n);
}
