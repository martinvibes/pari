// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Proofs } from "@/components/near/docs/Proofs";
import { BACKEND } from "@/lib/backend";

export const metadata: Metadata = { title: "Prove one fact" };

// Part of the NEAR build's docs only.
export default function ProofsPage() {
  if (BACKEND !== "near") notFound();
  return <Proofs />;
}
