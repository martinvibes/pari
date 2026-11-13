// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import { HowItRuns } from "@/components/near/docs/HowItRuns";

export const metadata: Metadata = { title: "How an action runs" };

export default function LifecyclePage() {
  return <HowItRuns />;
}
