// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import { LeakTest } from "@/components/near/docs/LeakTest";

export const metadata: Metadata = { title: "The leak test" };

export default function LeakTestPage() {
  return <LeakTest />;
}
