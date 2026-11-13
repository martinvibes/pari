// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import { Introduction } from "@/components/near/docs/Introduction";

export const metadata: Metadata = { title: "Introduction" };

export default function IntroductionPage() {
  return <Introduction />;
}
