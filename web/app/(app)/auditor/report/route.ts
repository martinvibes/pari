// SPDX-License-Identifier: Apache-2.0

import { BACKEND } from "@/lib/backend";
import { loadCast, partyOf } from "@/lib/ledger/cast";
import { auditTrail, trailCsv } from "@/lib/pari/audit";
import { DEAL_ID } from "@/lib/pari/deal";
import { persona } from "@/lib/pari/personas";
import { namer } from "@/lib/pari/session";

export const dynamic = "force-dynamic";

/** The auditor's trail as CSV, read live from the auditor's own view. */
export async function GET() {
  // The CSV trail is built from Canton's transaction stream; on NEAR the auditor's screen is the report.
  if (BACKEND === "near") return new Response("Not available on NEAR.", { status: 404 });
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
