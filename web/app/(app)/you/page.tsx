// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import { OwnAccount } from "@/components/near/OwnAccount";
import { NEAR, UNITS_PER_CENT } from "@/lib/near/config";

export const metadata: Metadata = { title: "Your own account" };

/** A visitor's own account on NEAR. The browser signs for it, so the page gets
 *  where the deal lives and, when Privy is set up, the Privy app to log in to. */
export default function YouPage() {
  const net = { rpcUrl: NEAR.rpcUrl, explorerUrl: NEAR.explorerUrl, ledger: NEAR.ledger, usdc: NEAR.usdc, unitsPerCent: UNITS_PER_CENT.toString() };
  return <OwnAccount net={net} privyAppId={process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? null} />;
}
