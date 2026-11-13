// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import { Trading } from "@/components/near/docs/Trading";

export const metadata: Metadata = { title: "Trading and screening" };

export default function TradingPage() {
  return <Trading />;
}
