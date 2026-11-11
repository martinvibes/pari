// SPDX-License-Identifier: Apache-2.0

import "server-only";
import { accountIn, envelopeAt, publicState } from "@/lib/near/books";
import { blockTime } from "@/lib/near/chain";
import { NEAR, viewKey } from "@/lib/near/config";
import { commitmentOf, prove, read, type Fact, type Proof } from "@/lib/near/proofs";
import { open } from "@/lib/near/seal";

// Selective disclosure. A party cuts one fact from its own envelope and hands
// it to an outsider as a proof. Checking the proof needs no key: the chain
// holds the enclave's commitment to every fact in the party's envelope, and
// the proof shows that this one fact is under it.

/** A party opens its latest envelope and cuts the proof of one fact from it:
 *  `position`, `cash`, `payments.0`. The proof names the block the envelope
 *  was read at, so it can be checked after the deal has moved on. */
export async function cutProof(personaId: string, item: string): Promise<Proof> {
  const chain = await publicState();
  const account = accountIn(chain, personaId);
  const { envelope, block } = await envelopeAt(account);
  if (!envelope) throw new Error(`The chain holds no envelope for ${account}.`);
  const view = JSON.parse(await open(envelope.sealed, viewKey(personaId, account))) as Record<string, unknown>;
  if (commitmentOf(chain.deal_id, view) !== envelope.commitment) {
    throw new Error(`${account}'s envelope does not hash to the commitment the chain holds for it.`);
  }
  return prove(view, item, { ledger: NEAR.ledger, deal: chain.deal_id, block });
}

export type Verdict =
  | { holds: true; fact: Fact; commitment: string; at: Date; latest: boolean; others: number }
  | { holds: false; why: string; fact?: Fact };

/** Checks a proof with no keys: the fact and its salt must hash into the
 *  proof's list, and the chain must have held that list's hash as the party's
 *  commitment at the block the proof names. */
export async function checkProof(proof: Proof): Promise<Verdict> {
  const shown = read(proof);
  if (!shown) return { holds: false, why: "The fact, its salt and the list of hashes do not belong together." };
  const { fact, commitment } = shown;
  if (proof.ledger !== NEAR.ledger) {
    return { holds: false, fact, why: `The proof names ${proof.ledger}. This deal's rules contract is ${NEAR.ledger}.` };
  }
  if (!Number.isSafeInteger(proof.block) || proof.block < 0) return { holds: false, fact, why: "The proof names no block." };
  const then = await envelopeAt(fact.party, proof.block).catch(() => null);
  if (!then) return { holds: false, fact, why: `NEAR could not be asked about block ${proof.block}.` };
  if (then.envelope?.commitment !== commitment) {
    return { holds: false, fact, why: `At block ${proof.block} the chain did not hold this commitment for ${fact.party}.` };
  }
  const [at, now] = await Promise.all([blockTime(proof.block), envelopeAt(fact.party)]);
  return { holds: true, fact, commitment, at, latest: now.envelope?.commitment === commitment, others: proof.hashes.length - 1 };
}

/** A proof as one piece of a link. */
export function encodeProof(proof: Proof): string {
  return Buffer.from(JSON.stringify(proof)).toString("base64url");
}

/** A proof from a link, or from its JSON pasted as text. */
export function decodeProof(text: string): Proof | null {
  const given = text.trim();
  try {
    const proof = JSON.parse(given.startsWith("{") ? given : Buffer.from(given, "base64url").toString()) as Proof;
    return proof !== null && typeof proof === "object" ? proof : null;
  } catch {
    return null;
  }
}
