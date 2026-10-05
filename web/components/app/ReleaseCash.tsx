// SPDX-License-Identifier: Apache-2.0

import * as act from "@/app/(app)/actions";
import { ActionForm } from "@/components/app/ActionForm";
import { Panel, Tag } from "@/components/app/ui";
import { strandedAllocations } from "@/lib/pari/deal";
import { formatCents, toCents } from "@/lib/pari/money";
import type { Persona } from "@/lib/pari/personas";
import type { View } from "@/lib/pari/session";

/** Cash the party allocated to a payment or trade that was then called off.
 *  Renders nothing when there is none. */
export function ReleaseCash({ view, persona }: { view: View; persona: Persona }) {
  const stranded = strandedAllocations(view.s, view.party);
  if (stranded.length === 0) return null;
  const total = stranded.reduce((sum, a) => sum + toCents(a.payload.allocation.transferLeg.amount), 0n);
  return (
    <Panel
      title="Cash to take back"
      note="You allocated this cash to a settlement that was then called off. It never left your control: it stays locked to that settlement until you withdraw it, and no one else can."
      aside={<Tag tone="signal">Locked</Tag>}
    >
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="label-data">Locked (USD)</p>
          <p className="mt-2 text-4xl font-light tabular-nums">{formatCents(total)}</p>
        </div>
        <ActionForm action={act.releaseCash} label="Withdraw to my holdings" hidden={{ persona: persona.id }} />
      </div>
    </Panel>
  );
}
