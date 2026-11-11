// SPDX-License-Identifier: Apache-2.0

"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/(app)/actions";
import { accountOf, txUrl } from "@/lib/near/config";
import { parseBasisPoints, parseCents, showRate } from "@/lib/near/money";
import * as ops from "@/lib/near/operations";
import { formatDate } from "@/lib/pari/dates";
import { formatCents } from "@/lib/pari/money";
import { personaById } from "@/lib/pari/personas";

// The app's writes on NEAR. Each action is one transaction signed by the one
// account entitled to it, and reports what the chain says back: the public
// outcome, or the enclave's own reason for refusing.

type Action = (previous: ActionResult | null, form: FormData) => Promise<ActionResult>;

async function run(work: () => Promise<{ message: string; hash: string }>): Promise<ActionResult> {
  try {
    const { message, hash } = await work();
    return { ok: true, message, links: [{ label: "Transaction", href: txUrl(hash) }] };
  } catch (error) {
    if (error instanceof ops.Refused) {
      // The feed shows a `Pari: …` message as a rule that was not met.
      return { ok: false, message: `Pari: ${error.message}`, links: [{ label: "Transaction", href: txUrl(error.hash) }] };
    }
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

function whole(form: FormData, name: string): number {
  const value = Number(field(form, name));
  if (!Number.isInteger(value) || value < 0) throw new Error(`Unknown ${name}.`);
  return value;
}

function personaField(form: FormData, name: string): string {
  const persona = personaById(field(form, name));
  if (!persona) throw new Error(`Unknown ${name}.`);
  return persona.id;
}

// Agent -------------------------------------------------------------------------

export const fixRate: Action = async (_, form) =>
  run(async () => {
    const rate = parseBasisPoints(field(form, "rate"), "the base rate");
    const end = field(form, "end");
    const { hash, public: out } = await ops.fixRate(rate, end);
    return { hash, message: `Base rate fixed at ${showRate(rate)} to ${formatDate(end)}. All-in ${showRate(Number(out.rate_bps))}.` };
  });

export const requestInterest: Action = async (_, form) =>
  run(async () => {
    const total = parseCents(field(form, "total"), "the total");
    const { hash } = await ops.requestInterest(total);
    return { hash, message: `Interest requested: ${formatCents(total)}. The chain shows the total; each lender's share stays sealed.` };
  });

export const settlePayment: Action = async (_, form) =>
  run(async () => {
    const { hash, public: out } = await ops.settle(whole(form, "request"));
    const credited = formatCents(BigInt(String(out.credited)));
    return { hash, message: `Settled. Every lender was credited in one step. The chain shows one total, ${credited}, and no lender's share.` };
  });

export const settleTrade: Action = async (_, form) =>
  run(async () => {
    const { hash, public: out } = await ops.settleTrade(whole(form, "trade"));
    return {
      hash,
      message: out.settled
        ? "Trade settled. Cash, register and both positions moved in one step."
        : "Not settled. Nothing moved, and the buyer is told nothing more. The reason is in the agent's envelope alone.",
    };
  });

// Borrower ----------------------------------------------------------------------

export const payRequest: Action = async (_, form) =>
  run(async () => {
    const amount = parseCents(field(form, "amount"), "the payment");
    const { hash, public: out } = await ops.payRequest(whole(form, "request"), amount);
    const back = BigInt(String(out.cash ?? "0"));
    return {
      hash,
      message:
        `Paid ${formatCents(amount)} of test USDC into the deal.` +
        (back > 0n ? ` ${formatCents(back)} was more than the request and is Northwind's cash in the books.` : ""),
    };
  });

export const updateDqList: Action = async (_, form) =>
  run(async () => {
    const accounts = form.getAll("dq").map((id) => {
      const persona = personaById(String(id));
      if (!persona) throw new Error("Unknown party on the DQ list.");
      return accountOf(persona.id);
    });
    const { hash } = await ops.setDqList(accounts);
    return { hash, message: "DQ list updated. It went to the enclave sealed: the chain carries only ciphertext." };
  });

// Lenders and buyers --------------------------------------------------------------

export const offerTrade: Action = async (_, form) =>
  run(async () => {
    const price = parseBasisPoints(field(form, "price"), "the price");
    const { hash } = await ops.offerTrade(personaField(form, "persona"), {
      buyer: accountOf(personaField(form, "buyer")),
      par: parseCents(field(form, "amount"), "the par amount"),
      pricePpm: price * 100,
      tradeDate: field(form, "date"),
    });
    return { hash, message: "Offer sent. Its size and price are sealed: the chain shows only that an offer was made." };
  });

export const acceptTrade: Action = async (_, form) =>
  run(async () => {
    const { hash } = await ops.acceptTrade(personaField(form, "persona"), whole(form, "trade"));
    return { hash, message: "Accepted. The agent settles it; the enclave screens the buyer and checks the cash first." };
  });

export const depositCash: Action = async (_, form) =>
  run(async () => {
    const amount = parseCents(field(form, "amount"), "the amount");
    const { hash } = await ops.depositCash(personaField(form, "persona"), amount);
    return { hash, message: `Paid ${formatCents(amount)} of test USDC into the deal. A deposit is public; what it is used for is not.` };
  });

export const withdraw: Action = async (_, form) =>
  run(async () => {
    const amount = parseCents(field(form, "amount"), "the amount");
    const { hash } = await ops.withdraw(personaField(form, "persona"), amount);
    return { hash, message: `Withdrew ${formatCents(amount)} of test USDC to your own NEAR account. A withdrawal is public.` };
  });
