// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import { Authority } from "@/components/near/docs/Authority";

export const metadata: Metadata = { title: "Authority matrix" };

export default function AuthorityPage() {
  return <Authority />;
}
