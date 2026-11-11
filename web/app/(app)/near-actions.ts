// SPDX-License-Identifier: Apache-2.0

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/app/(app)/actions";
import { accountOf, OPERATORS, txUrl } from "@/lib/near/config";
import { cutProof, encodeProof } from "@/lib/near/disclosure";
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
      const links = [{ label: "Transaction", href: txUrl(error.hash) }];
      // NEAR waits about two minutes for the enclave. No answer in that time is
      // no rule's refusal: nothing ran, and the same action can be sent again.
      if (error.message.startsWith("the enclave did not answer")) {
        const message = "The enclave did not answer within NEAR's two-minute wait. Press it again: an answer that comes late counts for nothing.";
        return { ok: false, message, links };
      }
      // The feed shows a `Pari: …` message as a rule that was not met.
      return { ok: false, message: `Pari: ${error.message}`, links };
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

/** What the screen says once one of the agent's actions has run, from what was
 *  asked and what the chain made public. */
const SAYS: Record<string, (args: Record<string, unknown>, out: Record<string, unknown>) => string> = {
  fix_rate: (args, out) =>
    `Base rate fixed at ${showRate(Number(args.base_rate_bps))} to ${formatDate(String(args.period_end))}. All-in ${showRate(Number(out.rate_bps))}.`,
  request_interest: (args) =>
    `Interest requested: ${formatCents(BigInt(String(args.expected_total)))}. The chain shows the total; each lender's share stays sealed.`,
  settle: (_, out) =>
    `Settled. Every lender was credited in one step. The chain shows one total, ${formatCents(BigInt(String(out.credited)))}, and no lender's share.`,
  settle_trade: (_, out) =>
    out.settled
      ? "Trade settled. Cash, register and both positions moved in one step."
      : "Not settled. Nothing moved, and the buyer is told nothing more. The reason is in the agent's envelope alone.",
};

/** An agent's action as the screen reports it: done, or waiting in the agent's DAO. */
function said(sent: ops.Ran | ops.Proposed): { hash: string; message: string } {
  if ("proposal" in sent) {
    const message = `Proposed, and approved by operator 1 of 3. Nothing has moved: proposal ${sent.proposal} runs when a second operator approves it.`;
    return { hash: sent.hash, message };
  }
  return { hash: sent.hash, message: SAYS[sent.method]?.(sent.args, sent.public) ?? `The agent ran ${sent.method}.` };
}

export const fixRate: Action = async (_, form) =>
  run(async () => said(await ops.fixRate(parseBasisPoints(field(form, "rate"), "the base rate"), field(form, "end"))));

export const requestInterest: Action = async (_, form) =>
  run(async () => said(await ops.requestInterest(parseCents(field(form, "total"), "the total"))));

export const settlePayment: Action = async (_, form) => run(async () => said(await ops.settle(whole(form, "request"))));

export const settleTrade: Action = async (_, form) => run(async () => said(await ops.settleTrade(whole(form, "trade"))));

/** A second operator of the agent's DAO approves a proposal, which runs it. */
export const approveProposal: Action = async (_, form) =>
  run(async () => {
    const operator = field(form, "operator");
    if (!OPERATORS.includes(operator)) throw new Error("Unknown operator.");
    const sent = await ops.approve(operator, whole(form, "proposal"));
    if ("proposal" in sent) return { hash: sent.hash, message: `Approved. Proposal ${sent.proposal} still needs another operator.` };
    return { hash: sent.hash, message: `Two of three operators approved, so the agent acted. ${said(sent).message}` };
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

// Proofs --------------------------------------------------------------------------

/** A party cuts the proof of one fact from its own envelope, and the browser
 *  opens the page where anyone can check it. Nothing is sent to the chain. */
export async function shareProof(form: FormData): Promise<void> {
  const proof = await cutProof(personaField(form, "persona"), field(form, "item"));
  redirect(`/verify?proof=${encodeProof(proof)}`);
}
