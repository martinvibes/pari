// SPDX-License-Identifier: Apache-2.0

import "server-only";
import {
  envelopeOf, openEnvelope, publicRecord, publicState, walletCents,
  type BooksView, type DealView, type Envelope, type PartyView, type PublicRecord, type PublicState,
} from "@/lib/near/books";
import { ChainError } from "@/lib/near/chain";
import { accountOf, KeyMissingError, NEAR, personaIdOf } from "@/lib/near/config";
import { personaById, PERSONAS, type Persona } from "@/lib/pari/personas";

// One screen's read of the deal: the public chain, the persona's envelope as
// the chain holds it, and that envelope opened with the persona's own key. A
// screen renders from its own party's view, so it cannot show what that party
// could not see.

export type Seen<V extends BooksView = BooksView> = {
  persona: Persona;
  account: string;
  chain: PublicState;
  envelope: Envelope;
  view: V;
  /** Test USDC in the party's own NEAR account, in cents. */
  wallet: bigint;
};

export type Unavailable = { unavailable: "chain" | "deal" | "keys"; detail: string };

export function isUnavailable<T extends object>(v: T | Unavailable): v is Unavailable {
  return "unavailable" in v;
}

/** A party's display name: the persona's, or the account itself. */
export function nameOf(account: string): string {
  const id = personaIdOf(account);
  return (id && personaById(id)?.name) || account;
}

export async function viewAs(persona: Persona): Promise<Seen | Unavailable> {
  const account = accountOf(persona.id);
  try {
    const [chain, envelope, wallet] = await Promise.all([publicState(), envelopeOf(account), walletCents(persona.id)]);
    if (!envelope) {
      return { unavailable: "deal", detail: `${account} has no envelope in deal ${chain.deal_id} on ${NEAR.ledger}.` };
    }
    return { persona, account, chain, envelope, view: await openEnvelope(persona.id, envelope), wallet };
  } catch (error) {
    return unavailable(error);
  }
}

/** One party's envelope as the chain holds it: sealed. */
export type Sealed = { persona: Persona; account: string; envelope: Envelope };

/** The same envelope with what the party's own key opens. */
export type Opened = Sealed & { view: BooksView };

/** The public chain next to every party's own read of the deal. A server with
 *  no keys reads what the public reads, and `seen` is null. */
export type Everyone = { chain: PublicState; record: PublicRecord[]; sealed: Sealed[]; seen: Opened[] | null };

export async function viewAll(): Promise<Everyone | Unavailable> {
  try {
    const [chain, record] = await Promise.all([publicState(), publicRecord()]);
    const sealed: Sealed[] = [];
    for (const persona of PERSONAS) {
      const account = accountOf(persona.id);
      const envelope = await envelopeOf(account);
      if (!envelope) {
        return { unavailable: "deal", detail: `${account} has no envelope in deal ${chain.deal_id} on ${NEAR.ledger}.` };
      }
      sealed.push({ persona, account, envelope });
    }
    return { chain, record, sealed, seen: await openAll(sealed) };
  } catch (error) {
    return unavailable(error);
  }
}

async function openAll(sealed: Sealed[]): Promise<Opened[] | null> {
  try {
    return await Promise.all(sealed.map(async (one) => ({ ...one, view: await openEnvelope(one.persona.id, one.envelope) })));
  } catch (error) {
    if (error instanceof KeyMissingError) return null;
    throw error;
  }
}

export function unavailable(error: unknown): Unavailable {
  if (error instanceof KeyMissingError) return { unavailable: "keys", detail: error.message };
  if (error instanceof ChainError) return { unavailable: "chain", detail: error.message };
  return { unavailable: "chain", detail: error instanceof Error ? error.message : String(error) };
}

/** The whole-deal view an agent, borrower or auditor screen needs. */
export function isDealView(seen: Seen): seen is Seen<DealView> {
  return seen.view.role !== "party";
}

export function isPartyView(seen: Seen): seen is Seen<PartyView> {
  return seen.view.role === "party";
}
