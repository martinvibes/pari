// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { AgentScreen } from "@/components/near/AgentScreen";

export const metadata: Metadata = { title: "Agent" };

export default function AgentPage() {
  return <AgentScreen />;
}
