// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import { WhoSeesWhat } from "@/components/near/docs/WhoSeesWhat";

export const metadata: Metadata = { title: "Who sees what" };

export default function PrivacyPage() {
  return <WhoSeesWhat />;
}
