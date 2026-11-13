// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LeakTest } from "@/components/near/docs/LeakTest";
import { BACKEND } from "@/lib/backend";

export const metadata: Metadata = { title: "The leak test" };

// Part of the NEAR build's docs only.
export default function LeakTestPage() {
  if (BACKEND !== "near") notFound();
  return <LeakTest />;
}
