// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import { Proofs } from "@/components/near/docs/Proofs";

export const metadata: Metadata = { title: "Prove one fact" };

export default function ProofsPage() {
  return <Proofs />;
}
