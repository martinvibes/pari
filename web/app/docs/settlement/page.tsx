// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import { Payments } from "@/components/near/docs/Payments";

export const metadata: Metadata = { title: "Payments and the two guards" };

export default function SettlementPage() {
  return <Payments />;
}
