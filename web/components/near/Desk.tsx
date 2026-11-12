// SPDX-License-Identifier: Apache-2.0

import { Lock, Screen } from "@/components/app/Screen";
import { ChainSaw } from "@/components/near/ChainSaw";
import { whose } from "@/components/near/parts";
import type { PublicRecord } from "@/lib/near/books";
import type { Seen } from "@/lib/near/session";

/** A party's desk: the deal as that party's key opens it, with the public
 *  chain's side of the same deal in a column beside it. */
export function Desk({ seen, record, children }: { seen: Seen; record: PublicRecord[] | null; children: React.ReactNode }) {
  const { persona, chain } = seen;
  return (
    <Screen
      title={`${persona.name}'s desk`}
      context={
        <span className="flex flex-wrap items-baseline gap-x-2.5">
          {chain.terms.name}
          <span className="fig text-[12px] text-ash">{chain.terms.facility_id}</span>
        </span>
      }
      aside={
        <>
          <Lock />
          Opened with {whose(persona)} key
        </>
      }
      chain={<ChainSaw seen={seen} record={record} />}
    >
      {chain.frozen ? (
        <p role="alert" className="border border-rose/55 px-4 py-3 text-[13.5px] leading-relaxed text-rose">
          The contract froze this deal: {chain.frozen}. No action runs until it is looked at.
        </p>
      ) : null}
      {children}
    </Screen>
  );
}
