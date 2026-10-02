// SPDX-License-Identifier: Apache-2.0

import "server-only";
import { create, disclosable, exercise, qualifiedName, submit, type Command } from "@/lib/ledger/client";
import type { Cast } from "@/lib/ledger/cast";
import {
  DEAL_ID,
  TRADE_LEG_ID,
  facilityOf,
  latestScreening,
  positionOf,
  requestState,
  tradeAllocation,
} from "@/lib/pari/deal";
import { CIP56, T, TEST_TOKEN_RULES } from "@/lib/pari/ids";
import { basisPointsToFraction, shareOf, toCents, toDecimal } from "@/lib/pari/money";
import { snapshot } from "@/lib/pari/snapshot";
import type * as P from "@/lib/pari/types";

// Every write the demo performs, each as the one party entitled to it. The
// ledger is the judge: any operation the model forbids comes back as an error
// carrying the model's `Pari: …` reason.

const NO_EXTRA_ARGS = { context: { values: {} }, meta: { values: {} } };
const DAY_MS = 24 * 60 * 60 * 1000;

function deadlines() {
  const now = Date.now();
  return {
    allocateBefore: new Date(now + 2 * DAY_MS).toISOString(),
    settleBefore: new Date(now + 3 * DAY_MS).toISOString(),
  };
}

function usd(cast: Cast): P.InstrumentId {
  return { admin: cast.registry, id: "USD" };
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
 *  registry's allocation factory, as the sender's CIP-56 wallet would. */
async function allocate(cast: Cast, spec: P.AllocationView["allocation"]) {
  const sender = spec.transferLeg.sender;
  const s = await snapshot(sender);
  const inputs = s.holdings.filter(
    (h) =>
      h.payload.owner === sender &&
      h.payload.lock === null &&
      h.payload.instrumentId.admin === spec.transferLeg.instrumentId.admin &&
      h.payload.instrumentId.id === spec.transferLeg.instrumentId.id,
  );
  if (inputs.length === 0) throw new Error("No cash to allocate from.");
  const [factory] = await disclosable(cast.registry, TEST_TOKEN_RULES);
  if (!factory) throw new Error("The token registry's allocation factory is missing.");
  await submit({
    actAs: [sender],
    disclosedContracts: [factory],
    commands: [
      exercise(CIP56.AllocationFactory, factory.contractId, "AllocationFactory_Allocate", {
        expectedAdmin: cast.registry,
        allocation: spec,
        requestedAt: new Date(Date.now() - 5000).toISOString(),
        inputHoldingCids: inputs.map((h) => h.contractId),
        extraArgs: NO_EXTRA_ARGS,
      }),
    ],
  });
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
  const allocations = paid.map((l) => [l.lender, { _1: l.allocation!.contractId, _2: NO_EXTRA_ARGS }]);
  await one(
    cast.agent,
    exercise(T.Facility, facility.contractId, "Facility_Settle", {
      fraction: basisPointsToFraction(state.fundedBp),
      positions,
      allocations,
    }),
  );
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
  await one(
    cast.agent,
    exercise(T.AgentDesk, desk.contractId, "Desk_SettleTrade", {
      facilityCid: facility.contractId,
      ticketCid,
      screeningCid: screening.contractId,
      sellerPositionCid: sellerPosition.contractId,
      buyerPositionCid: positionOf(s, buyer)?.contractId ?? null,
      allocation: { _1: allocation.contractId, _2: NO_EXTRA_ARGS },
    }),
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
    await allocate(cast, {
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
      instrumentId: usd(cast),
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
  await allocate(cast, {
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
