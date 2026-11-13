// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import { Governance } from "@/components/near/docs/Governance";

export const metadata: Metadata = { title: "The agent, two of three" };

export default function GovernancePage() {
  return <Governance />;
}
