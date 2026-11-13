// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { BorrowerScreen } from "@/components/near/BorrowerScreen";

export const metadata: Metadata = { title: "Borrower" };

export default function BorrowerPage() {
  return <BorrowerScreen />;
}
