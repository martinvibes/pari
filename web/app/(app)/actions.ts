// SPDX-License-Identifier: Apache-2.0

"use server";

import { revalidatePath } from "next/cache";
import { loadCast, partyOf, type Cast } from "@/lib/ledger/cast";
import { recordUpdates } from "@/lib/ledger/client";
import { formatDate } from "@/lib/pari/dates";
import * as ops from "@/lib/pari/operations";
import { personaById } from "@/lib/pari/personas";
import type { Side } from "@/lib/pari/types";

// The app's writes. Each action submits as the one party entitled to it and
// reports the ledger's verdict, including the model's own refusal reasons and,
// when it commits, the update id of each transaction.

export type ActionResult = { ok: boolean; message: string; updateIds?: string[] };
type Action = (previous: ActionResult | null, form: FormData) => Promise<ActionResult>;

async function run(work: (cast: Cast) => Promise<string>): Promise<ActionResult> {
  try {
    const { result, updateIds } = await recordUpdates(() => work(loadCast()));
    return { ok: true, message: result, updateIds };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  } finally {
    revalidatePath("/", "layout");
  }
}

function field(form: FormData, name: string): string {
  const value = form.get(name);
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Enter a ${name}.`);
  return value.trim();
}

function partyField(cast: Cast, form: FormData, name: string): string {
  const persona = personaById(field(form, name));
  if (!persona) throw new Error(`Unknown ${name}.`);
  return partyOf(cast, persona);
}

function positiveNumber(text: string, what: string): string {
  const n = Number(text.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Enter a positive ${what}.`);
  return text.replace(/,/g, "");
}

// Agent -------------------------------------------------------------------------

export const fixRate: Action = async (_, form) =>
  run(async (cast) => {
    const rate = field(form, "rate");
    const end = field(form, "end");
    await ops.fixRate(cast, rate, end);
    return `Base rate fixed at ${rate}% to ${formatDate(end)}.`;
  });

export const requestInterest: Action = async () =>
  run(async (cast) => {
    await ops.requestInterest(cast);
    return "Interest requested. One leg per lender is waiting for the borrower.";
  });

export const acceptPrepayment: Action = async (_, form) =>
  run(async (cast) => {
    await ops.acceptPrepayment(cast, field(form, "notice"));
    return "Prepayment accepted. Pro-rata principal legs are waiting for the borrower.";
  });

export const cancelRequest: Action = async () =>
  run(async (cast) => {
    await ops.cancelRequest(cast);
    return "Request cancelled. Nothing moved: any cash Northwind allocated is still its own to take back.";
  });

export const settlePayment: Action = async () =>
  run(async (cast) => {
    await ops.settlePayment(cast);
    return "Settled. Every lender was paid in one transaction.";
  });

export const screenBuyer: Action = async (_, form) =>
  run(async (cast) => {
    await ops.screenBuyer(cast, field(form, "buyer"));
    return "Buyer screened against the borrower's DQ list.";
  });

export const settleTrade: Action = async (_, form) =>
  run(async (cast) => {
    await ops.settleTrade(cast, field(form, "ticket"));
    return "Trade settled. Cash, register and both positions moved in one transaction.";
  });

export const declineTrade: Action = async (_, form) =>
  run(async (cast) => {
    await ops.declineTrade(cast, field(form, "ticket"));
    return "Trade declined. Nothing moved: the buyer takes its cash back from its own screen.";
  });

export const shareDocument: Action = async (_, form) =>
  run(async (cast) => {
    await ops.shareDocument(cast, field(form, "document"), field(form, "election"));
    return "Document shared.";
  });

// Borrower ----------------------------------------------------------------------

export const fundRequest: Action = async (_, form) =>
  run(async (cast) => {
    const percent = Number(field(form, "percent"));
    const bp = Math.round(percent * 100);
    if (!Number.isFinite(bp) || bp <= 0 || bp > 10000) throw new Error("Fund between 0.01% and 100%.");
    await ops.fundRequest(cast, bp);
    return `Funded ${percent}% of every leg from Northwind's own holdings.`;
  });

export const noticePrepayment: Action = async (_, form) =>
  run(async (cast) => {
    const amount = positiveNumber(field(form, "amount"), "amount");
    await ops.noticePrepayment(cast, amount);
    return "Prepayment notice sent to the agent.";
  });

export const updateDqList: Action = async (_, form) =>
  run(async (cast) => {
    const parties = form.getAll("dq").map((id) => {
      const persona = personaById(String(id));
      if (!persona) throw new Error("Unknown party on the DQ list.");
      return partyOf(cast, persona);
    });
    await ops.updateDqList(cast, parties);
    return "DQ list updated. Only Northwind and the agent can see it.";
  });

// Any payer ---------------------------------------------------------------------

export const releaseCash: Action = async (_, form) =>
  run(async (cast) => {
    await ops.releaseCash(partyField(cast, form, "persona"));
    return "Cash released back to your own holdings.";
  });

// Lenders and buyers --------------------------------------------------------------

export const offerTrade: Action = async (_, form) =>
  run(async (cast) => {
    const seller = partyField(cast, form, "persona");
    await ops.offerTrade(cast, seller, {
      buyer: partyField(cast, form, "buyer"),
      amount: positiveNumber(field(form, "amount"), "amount"),
      pricePercent: positiveNumber(field(form, "price"), "price"),
      tradeDate: field(form, "date"),
    });
    return "Offer sent. Only the buyer can see it.";
  });

export const acceptTrade: Action = async (_, form) =>
  run(async (cast) => {
    await ops.acceptTrade(cast, partyField(cast, form, "persona"), field(form, "offer"));
    return "Accepted and funded. The agent settles once the buyer clears screening.";
  });

export const rejectTrade: Action = async (_, form) =>
  run(async (cast) => {
    await ops.rejectTrade(partyField(cast, form, "persona"), field(form, "offer"));
    return "Offer rejected.";
  });

export const withdrawOffer: Action = async (_, form) =>
  run(async (cast) => {
    await ops.withdrawOffer(partyField(cast, form, "persona"), field(form, "offer"));
    return "Offer withdrawn.";
  });

export const setSide: Action = async (_, form) =>
  run(async (cast) => {
    const side = field(form, "side") as Side;
    if (side !== "PublicSide" && side !== "PrivateSide") throw new Error("Unknown side.");
    await ops.setSide(cast, partyField(cast, form, "persona"), side);
    return side === "PrivateSide" ? "Now private side: MNPI can reach you." : "Now public side: no MNPI.";
  });
