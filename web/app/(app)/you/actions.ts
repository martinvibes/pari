// SPDX-License-Identifier: Apache-2.0

"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/(app)/actions";
import { txUrl } from "@/lib/near/config";
import { Refused } from "@/lib/near/operations";
import * as cast from "@/lib/near/visitor/cast";
import { KEY_ACCOUNT, PAY_IN, SLICE } from "@/lib/near/visitor/terms";
import { showPrice } from "@/lib/near/money";
import { formatCents } from "@/lib/pari/money";

// What the rest of the cast does for a visitor's own account. The visitor's
// own transactions are not here: the visitor's browser signs and sends those.

type Said = { ok?: boolean; message: string; sent: cast.Sent[] };

async function answer(account: string, work: () => Promise<Said>): Promise<ActionResult> {
  try {
    if (!KEY_ACCOUNT.test(account)) throw new Error("That is not an account made by a key.");
    const { ok = true, message, sent } = await work();
    return { ok, message, links: sent.map(({ label, hash }) => ({ label, href: txUrl(hash) })) };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, message: `Pari: ${error.message}`, links: [{ label: "Transaction", href: txUrl(error.hash) }] };
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  } finally {
    revalidatePath("/", "layout");
  }
}

/** The faucet account sends the visitor test NEAR for gas and test USDC. */
export async function fund(account: string): Promise<ActionResult> {
  return answer(account, async () => {
    const sent = await cast.fund(account);
    const message = sent.length
      ? `The faucet topped your account up: test NEAR for gas, and ${formatCents(PAY_IN)} of test USDC. Both transfers are public.`
      : "Your account already holds test NEAR and test USDC.";
    return { message, sent };
  });
}

/** Alder's account offers the visitor a slice of its position. */
export async function offer(account: string): Promise<ActionResult> {
  return answer(account, async () => {
    const { hash } = await cast.offer(account);
    const message = `Alder offered you ${formatCents(SLICE.par)} of the loan at ${showPrice(SLICE.pricePpm)}. Buyer, size and price went to the enclave sealed.`;
    return { message, sent: [{ label: "Transaction", hash }] };
  });
}

/** The agent's account settles the visitor's accepted trade. */
export async function settle(account: string, tradeId: number): Promise<ActionResult> {
  return answer(account, async () => {
    const { settled, sent } = await cast.settle(account, tradeId);
    const message = settled
      ? "Trade settled. Your cash went to Alder and the loan came to you in one step."
      : "Not settled. Nothing moved, and you are told no more than that. The reason is in the agent's envelope alone.";
    return { ok: settled, message, sent };
  });
}
