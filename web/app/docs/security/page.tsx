// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import { Limits } from "@/components/near/docs/Limits";

export const metadata: Metadata = { title: "Limits and status" };

export default function SecurityPage() {
  return <Limits />;
}
