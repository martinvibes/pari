// SPDX-License-Identifier: Apache-2.0

import "server-only";
import { CastMissingError, loadCast, partyOf, personaOf, type Cast } from "@/lib/ledger/cast";
import { LEDGER } from "@/lib/ledger/config";
import { LedgerError } from "@/lib/ledger/client";
import { facilityOf } from "@/lib/pari/deal";
import type { Persona } from "@/lib/pari/personas";
import { snapshot, type Snapshot } from "@/lib/pari/snapshot";
import type { Period } from "@/lib/pari/types";

// One screen's read of the ledger: the demo cast, the persona's party and
// everything that party can see. A screen renders from its own party's view.

export type View = {
  cast: Cast;
  party: string;
  s: Snapshot;
  /** A party's name in the demo cast, for display. */
  name: (party: string) => string;
};

export type Unavailable = { unavailable: "cast" | "ledger"; detail: string };

/** A party id without its namespace or seed tag: `Alder-tmg4jo::1220…` → `Alder`. */
export function shortParty(party: string): string {
  return party.split("::")[0]!.replace(/-[0-9a-z]+$/, "");
}

export function namer(cast: Cast) {
  return (party: string) => personaOf(cast, party)?.name ?? shortParty(party);
}

export async function viewAs(persona: Persona): Promise<View | Unavailable> {
  try {
    const cast = loadCast();
    const party = partyOf(cast, persona);
    return { cast, party, s: await snapshot(party), name: namer(cast) };
  } catch (error) {
    return unavailable(error);
  }
}

export function unavailable(error: unknown): Unavailable {
  if (error instanceof CastMissingError) return { unavailable: "cast", detail: error.message };
  if (error instanceof LedgerError) return { unavailable: "ledger", detail: error.message };
  return { unavailable: "ledger", detail: `Could not reach the ledger at ${LEDGER.url}.` };
}

export function isUnavailable<T extends object>(v: T | Unavailable): v is Unavailable {
  return "unavailable" in v;
}

/** The current interest period, which the agent announces to every lender
 *  with its rate notice. The demo reads it from the agent's view to default a
 *  lender's trade date into the period. */
export async function announcedPeriod(cast: Cast): Promise<Period | null> {
  const facility = facilityOf(await snapshot(cast.agent));
  return facility?.payload.period ?? null;
}
