// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { AuditorScreen } from "@/components/near/AuditorScreen";

export const metadata: Metadata = { title: "Auditor" };

export default function AuditorPage() {
  return <AuditorScreen />;
}
