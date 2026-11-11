// Proofs a party can hand to an outsider: one fact from its envelope, checked
// against the commitment the chain holds for that party.
//
// The enclave cuts each view into facts and publishes sha256 over their salted
// hashes (near/enclave/src/proofs.rs). This file cuts and hashes a view the
// same way, so it must change when that one does. web/lib/near/proofs.ts is a
// copy of this file.

import { createHash, createHmac } from "node:crypto";

/** What the party hands over. It names one fact and no other. */
export interface Proof {
  /** The rules contract, and a block at which it held the party's commitment. */
  ledger: string;
  block: number;
  /** The fact, exactly as the enclave hashed it: the JSON of a `Fact`. */
  fact: string;
  /** The fact's salt, in hex. */
  salt: string;
  /** The salted hash of every fact in the party's view, in hex. This fact's is at `index`. */
  hashes: string[];
  index: number;
}

export interface Fact {
  deal: string;
  /** Where the value sits in the party's view: `cash`, `position`, `payments.0`. */
  item: string;
  party: string;
  /** The action after which the view held it. */
  seq: number;
  value: unknown;
}

type View = Record<string, unknown>;

const SEED_FIELD = "proof_seed";
/** Fields that say whose view it is. Every fact repeats them. */
const NOT_FACTS = ["party", "role", "seq", SEED_FIELD];
const HASH = /^[0-9a-f]{64}$/;

/** JSON with every object's keys in order and no spaces, as the enclave writes it. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  const fields = value as Record<string, unknown>;
  const body = Object.keys(fields).sort().map((key) => `${JSON.stringify(key)}:${canonical(fields[key])}`);
  return `{${body.join(",")}}`;
}

function sha256(...parts: (Uint8Array | string)[]): Buffer {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return hash.digest();
}

/** A fact's hash: sha256 of its salt, then its text. */
export function factHash(salt: string, text: string): string {
  return sha256(Buffer.from(salt, "hex"), text).toString("hex");
}

function commitment(hashes: string[]): string {
  return sha256(Buffer.from(hashes.join(""), "hex")).toString("hex");
}

/** Every fact in an opened envelope, in item order, with its salt and hash. */
function facts(deal: string, view: View): { item: string; text: string; salt: string; hash: string }[] {
  const items: [string, unknown][] = [];
  for (const [field, value] of Object.entries(view)) {
    if (NOT_FACTS.includes(field)) continue;
    if (Array.isArray(value)) value.forEach((entry, index) => items.push([`${field}.${index}`, entry]));
    else items.push([field, value]);
  }
  items.sort(([a], [b]) => (a < b ? -1 : 1));
  return items.map(([item, value]) => {
    const text = canonical({ deal, item, party: view.party, seq: view.seq, value });
    const salt = createHmac("sha256", String(view[SEED_FIELD])).update(item).digest("hex");
    return { item, text, salt, hash: factHash(salt, text) };
  });
}

/** The commitment an opened envelope hashes to: what the chain holds for its party. */
export function commitmentOf(deal: string, view: View): string {
  return commitment(facts(deal, view).map((fact) => fact.hash));
}

/** Cuts the proof of one fact from an opened envelope that was read at `block`. */
export function prove(view: View, item: string, at: { ledger: string; deal: string; block: number }): Proof {
  const all = facts(at.deal, view);
  const index = all.findIndex((fact) => fact.item === item);
  const shown = all[index];
  if (!shown) throw new Error(`the view holds no ${item}`);
  return { ledger: at.ledger, block: at.block, fact: shown.text, salt: shown.salt, hashes: all.map((fact) => fact.hash), index };
}

/**
 * What a proof says and the commitment it stands on, or `null` when its parts
 * do not belong together. This is arithmetic only: whether the chain holds
 * that commitment for the fact's party is the caller's next question.
 */
export function read(proof: Proof): { fact: Fact; commitment: string } | null {
  try {
    const { fact: text, salt, hashes, index } = proof;
    if (typeof text !== "string" || !HASH.test(salt) || !Array.isArray(hashes) || !hashes.every((hash) => HASH.test(hash))) return null;
    if (hashes[index] !== factHash(salt, text)) return null;
    const fact = JSON.parse(text) as Fact;
    const named = [fact.deal, fact.item, fact.party].every((field) => typeof field === "string") && Number.isInteger(fact.seq);
    return named ? { fact, commitment: commitment(hashes) } : null;
  } catch {
    return null;
  }
}
