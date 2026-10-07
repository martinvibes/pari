// SPDX-License-Identifier: Apache-2.0

import "server-only";
import { create, exercise, qualifiedName, submit, type Command } from "@/lib/ledger/client";
import type { Cast } from "@/lib/ledger/cast";
import { NO_EXTRA_ARGS, disclosedOf, registryFor } from "@/lib/ledger/registry";
import {
  DEAL_ID,
  TRADE_LEG_ID,
  facilityOf,
  instrumentOf,
  latestScreening,
  positionOf,
  requestState,
  strandedAllocations,
  tradeAllocation,
} from "@/lib/pari/deal";
import { CIP56, T } from "@/lib/pari/ids";
import { basisPointsToFraction, shareOf, toCents, toDecimal } from "@/lib/pari/money";
import { snapshot } from "@/lib/pari/snapshot";
import type * as P from "@/lib/pari/types";

// Every write the demo performs, each as the one party entitled to it. The
// ledger is the judge: any operation the model forbids comes back as an error
// carrying the model's `Pari: …` reason.

const DAY_MS = 24 * 60 * 60 * 1000;

function deadlines() {
  const now = Date.now();
  return {
    allocateBefore: new Date(now + 2 * DAY_MS).toISOString(),
    settleBefore: new Date(now + 3 * DAY_MS).toISOString(),
  };
}

async function requireFacility(party: string) {
  const s = await snapshot(party);
  const facility = facilityOf(s);
  if (!facility) throw new Error("The demo facility is not on the ledger. Run `make seed`.");
  return { s, facility };
}

async function one(party: string, command: Command) {
  return submit({ actAs: [party], commands: [command] });
}

// CIP-56 wallet ---------------------------------------------------------------

/** Fund one settlement leg from the sender's own holdings through the
 *  registry's allocation factory, as the sender's CIP-56 wallet would.
 *  Returns the allocation's contract id. */
export async function allocate(spec: P.AllocationView["allocation"]): Promise<string> {
  const { sender, instrumentId } = spec.transferLeg;
  const s = await snapshot(sender);
  const inputs = s.holdings.filter(
    (h) =>
      h.payload.owner === sender &&
      h.payload.lock === null &&
      h.payload.instrumentId.admin === spec.transferLeg.instrumentId.admin &&
      h.payload.instrumentId.id === spec.transferLeg.instrumentId.id,
  );
  if (inputs.length === 0) throw new Error("No cash to allocate from.");
  const args = {
    expectedAdmin: instrumentId.admin,
    allocation: spec,
    requestedAt: new Date(Date.now() - 5000).toISOString(),
    inputHoldingCids: inputs.map((h) => h.contractId),
    extraArgs: NO_EXTRA_ARGS,
  };
  const { factoryId, extraArgs, disclosed } = await registryFor(instrumentId).allocationFactory(args);
  await submit({
    actAs: [sender],
    disclosedContracts: disclosed,
    commands: [exercise(CIP56.AllocationFactory, factoryId, "AllocationFactory_Allocate", { ...args, extraArgs })],
  });
  const funded = (await snapshot(sender)).allocations.find(
    (a) =>
      a.payload.allocation.transferLegId === spec.transferLegId &&
      a.payload.allocation.settlement.settlementRef.id === spec.settlement.settlementRef.id &&
      a.payload.allocation.transferLeg.receiver === spec.transferLeg.receiver,
  );
  if (!funded) throw new Error("The registry did not create the allocation.");
  return funded.contractId;
}

/** Each allocation paired with the registry context that executes it, and
 *  the contracts the agent's submission must disclose. */
export async function executable(instrument: P.InstrumentId, allocationCids: string[]) {
  const registry = registryFor(instrument);
  const contexts = await Promise.all(allocationCids.map((cid) => registry.allocationContext(cid, "execute-transfer")));
  return {
    inputs: allocationCids.map((cid, i) => ({ _1: cid, _2: contexts[i]!.extraArgs })),
    disclosed: disclosedOf(contexts),
  };
}

// Agent -----------------------------------------------------------------------

export async function fixRate(cast: Cast, baseRatePercent: string, periodEnd: string) {
  const { facility } = await requireFacility(cast.agent);
  const baseRate = (Number(baseRatePercent) / 100).toFixed(6);
  await one(cast.agent, exercise(T.Facility, facility.contractId, "Facility_FixRate", { baseRate, periodEnd }));
}

export async function requestInterest(cast: Cast) {
  const { facility } = await requireFacility(cast.agent);
  await one(cast.agent, exercise(T.Facility, facility.contractId, "Facility_RequestInterest", deadlines()));
}

export async function acceptPrepayment(cast: Cast, noticeCid: string) {
  const { facility } = await requireFacility(cast.agent);
  await one(
    cast.agent,
    exercise(T.Facility, facility.contractId, "Facility_AcceptPrepayment", { noticeCid, ...deadlines() }),
  );
}

export async function cancelRequest(cast: Cast) {
  const { facility } = await requireFacility(cast.agent);
  await one(cast.agent, exercise(T.Facility, facility.contractId, "Facility_CancelRequest", {}));
}

/** Settle the open request at the fraction the borrower's allocations pay. */
export async function settlePayment(cast: Cast) {
  const { s, facility } = await requireFacility(cast.agent);
  const state = requestState(s, facility.payload);
  if (!state) throw new Error("No payment request is open.");
  if (state.fundedBp === null) throw new Error("The borrower has not funded every leg at one common fraction yet.");
  const paid = state.legs.filter((l) => shareOf(l.due, state.fundedBp!) > 0n);
  const positions = paid.map((l) => {
    const position = positionOf(s, l.lender);
    if (!position) throw new Error("A lender's position is missing.");
    return [l.lender, position.contractId];
  });
  const { inputs, disclosed } = await executable(
    facility.payload.terms.instrumentId,
    paid.map((l) => l.allocation!.contractId),
  );
  await submit({
    actAs: [cast.agent],
    disclosedContracts: disclosed,
    commands: [
      exercise(T.Facility, facility.contractId, "Facility_Settle", {
        fraction: basisPointsToFraction(state.fundedBp),
        positions,
        allocations: paid.map((l, i) => [l.lender, inputs[i]]),
      }),
    ],
  });
}

/** Check a buyer against the borrower's DQ list. The buyer never sees this. */
export async function screenBuyer(cast: Cast, candidate: string) {
  const s = await snapshot(cast.agent);
  const list = s.dqLists.find((l) => l.payload.facilityId === DEAL_ID);
  if (!list) throw new Error("The borrower's DQ list is missing.");
  await one(cast.agent, exercise(T.DqList, list.contractId, "DqList_Screen", { candidate }));
}

/** Record the assignment, settle the cash and move both positions, atomically. */
export async function settleTrade(cast: Cast, ticketCid: string) {
  const { s, facility } = await requireFacility(cast.agent);
  const ticket = s.tickets.find((t) => t.contractId === ticketCid);
  if (!ticket) throw new Error("The trade ticket is gone.");
  const { seller, buyer } = ticket.payload;
  const screening = latestScreening(s, buyer);
  if (!screening) throw new Error("Screen the buyer against the DQ list first.");
  const sellerPosition = positionOf(s, seller);
  if (!sellerPosition) throw new Error("The seller holds no position.");
  const allocation = tradeAllocation(s, ticket.payload);
  if (!allocation) throw new Error("The buyer has not funded the price yet.");
  const desk = s.desks[0];
  if (!desk) throw new Error("The agent's desk is missing.");
  const { inputs, disclosed } = await executable(ticket.payload.instrumentId, [allocation.contractId]);
  await submit({
    actAs: [cast.agent],
    disclosedContracts: disclosed,
    commands: [
      exercise(T.AgentDesk, desk.contractId, "Desk_SettleTrade", {
        facilityCid: facility.contractId,
        ticketCid,
        screeningCid: screening.contractId,
        sellerPositionCid: sellerPosition.contractId,
        buyerPositionCid: positionOf(s, buyer)?.contractId ?? null,
        allocation: inputs[0],
      }),
    ],
  });
}

/** Call off a trade the agent will not settle, e.g. one whose buyer is
 *  disqualified. Nothing moves: the buyer withdraws its own cash. */
export async function declineTrade(cast: Cast, ticketCid: string) {
  await one(
    cast.agent,
    exercise(CIP56.AllocationRequest, ticketCid, "AllocationRequest_Withdraw", { extraArgs: NO_EXTRA_ARGS }),
  );
}

export async function shareDocument(cast: Cast, documentCid: string, electionCid: string) {
  await one(cast.agent, exercise(T.Document, documentCid, "Document_Share", { electionCid }));
}

// Borrower --------------------------------------------------------------------

/** Fund every leg of the open request at `bp` basis points of what is due. */
export async function fundRequest(cast: Cast, bp: number) {
  const { s, facility } = await requireFacility(cast.borrower);
  const state = requestState(s, facility.payload);
  if (!state) throw new Error("No payment request is open.");
  const { settlement, legs } = state.request.payload;
  for (const leg of state.legs) {
    const amount = shareOf(leg.due, bp);
    if (leg.allocation || amount === 0n) continue;
    const transferLeg = legs[leg.legId]!;
    await allocate({
      settlement,
      transferLegId: leg.legId,
      transferLeg: { ...transferLeg, amount: toDecimal(amount) },
    });
  }
}

export async function noticePrepayment(cast: Cast, amount: string) {
  await one(
    cast.borrower,
    create(T.PrepaymentNotice, {
      borrower: cast.borrower,
      agent: cast.agent,
      facilityId: DEAL_ID,
      amount: toDecimal(toCents(amount)),
    }),
  );
}

export async function updateDqList(cast: Cast, disqualified: string[]) {
  const s = await snapshot(cast.borrower);
  const list = s.dqLists.find((l) => l.payload.facilityId === DEAL_ID);
  if (!list) throw new Error("The DQ list is missing.");
  await one(
    cast.borrower,
    exercise(T.DqList, list.contractId, "DqList_Update", {
      newList: { map: disqualified.map((p) => [p, {}]) },
    }),
  );
}

/** Appoint the cast's auditor to the facility, as the borrower. */
export async function appointAuditor(cast: Cast) {
  const { facility } = await requireFacility(cast.borrower);
  await one(
    cast.borrower,
    exercise(T.Facility, facility.contractId, "Facility_AppointAuditor", { newAuditor: cast.auditor }),
  );
}

export async function removeAuditor(cast: Cast) {
  const { facility } = await requireFacility(cast.borrower);
  await one(cast.borrower, exercise(T.Facility, facility.contractId, "Facility_RemoveAuditor", {}));
}

// Any payer -------------------------------------------------------------------

/** Take back cash allocated to settlements that were called off, as its owner. */
export async function releaseCash(owner: string) {
  const stranded = strandedAllocations(await snapshot(owner), owner);
  if (stranded.length === 0) throw new Error("No cash is held for a called-off settlement.");
  const contexts = await Promise.all(
    stranded.map((a) => registryFor(a.payload.allocation.transferLeg.instrumentId).allocationContext(a.contractId, "withdraw")),
  );
  await submit({
    actAs: [owner],
    disclosedContracts: disclosedOf(contexts),
    commands: stranded.map((a, i) =>
      exercise(CIP56.Allocation, a.contractId, "Allocation_Withdraw", { extraArgs: contexts[i]!.extraArgs }),
    ),
  });
}

// Lenders and buyers ------------------------------------------------------------

export async function offerTrade(
  cast: Cast,
  seller: string,
  trade: { buyer: string; amount: string; pricePercent: string; tradeDate: string },
) {
  await one(
    seller,
    create(T.TradeOffer, {
      seller,
      buyer: trade.buyer,
      agent: cast.agent,
      facilityId: DEAL_ID,
      amount: toDecimal(toCents(trade.amount)),
      price: (Number(trade.pricePercent) / 100).toFixed(6),
      tradeDate: trade.tradeDate,
      instrumentId: instrumentOf(cast),
      settleBefore: deadlines().settleBefore,
    }),
  );
}

/** Accept a trade and fund its price, as the buyer. */
export async function acceptTrade(cast: Cast, buyer: string, offerCid: string) {
  const created = await one(buyer, exercise(T.TradeOffer, offerCid, "TradeOffer_Accept", {}));
  const ticketCid = created.find((c) => qualifiedName(c.templateId) === qualifiedName(T.TradeTicket))?.contractId;
  const ticket = (await snapshot(buyer)).tickets.find((t) => t.contractId === ticketCid);
  if (!ticket) throw new Error("The trade ticket was not created.");
  const { seller, cash, instrumentId, settlement } = ticket.payload;
  await allocate({
    settlement,
    transferLegId: TRADE_LEG_ID,
    transferLeg: { sender: buyer, receiver: seller, amount: cash, instrumentId, meta: { values: {} } },
  });
}

export async function rejectTrade(buyer: string, offerCid: string) {
  await one(buyer, exercise(T.TradeOffer, offerCid, "TradeOffer_Reject", {}));
}

export async function withdrawOffer(seller: string, offerCid: string) {
  await one(seller, exercise(T.TradeOffer, offerCid, "TradeOffer_Withdraw", {}));
}

/** Make or change the lender's own information-wall election. */
export async function setSide(cast: Cast, lender: string, side: P.Side) {
  const s = await snapshot(lender);
  const election = s.elections.find((e) => e.payload.lender === lender && e.payload.facilityId === DEAL_ID);
  await one(
    lender,
    election
      ? exercise(T.InfoElection, election.contractId, "InfoElection_Change", { newSide: side })
      : create(T.InfoElection, { lender, agent: cast.agent, facilityId: DEAL_ID, side }),
  );
}
