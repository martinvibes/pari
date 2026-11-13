// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import { Roles } from "@/components/near/docs/Roles";

export const metadata: Metadata = { title: "Parties and roles" };

export default function RolesPage() {
  return <Roles />;
}
