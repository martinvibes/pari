// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import { CheckIt } from "@/components/near/docs/CheckIt";

export const metadata: Metadata = { title: "Check it yourself" };

export default function QuickstartPage() {
  return <CheckIt />;
}
