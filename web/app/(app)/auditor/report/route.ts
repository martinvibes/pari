// SPDX-License-Identifier: Apache-2.0

import { loadCast, partyOf } from "@/lib/ledger/cast";
import { auditTrail, trailCsv } from "@/lib/pari/audit";
import { DEAL_ID } from "@/lib/pari/deal";
import { persona } from "@/lib/pari/personas";
import { namer } from "@/lib/pari/session";

export const dynamic = "force-dynamic";

/** The auditor's trail as CSV, read live from the auditor's own view. */
export async function GET() {
  const cast = loadCast();
  const name = namer(cast);
  const audit = await auditTrail(partyOf(cast, persona("auditor")), name);
  return new Response(trailCsv(audit, name), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="pari-audit-trail-${DEAL_ID}.csv"`,
    },
  });
}
