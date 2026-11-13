// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { VisibilityScreen } from "@/components/near/VisibilityScreen";

export const metadata: Metadata = { title: "Visibility" };

export default function VisibilityPage() {
  return <VisibilityScreen />;
}
