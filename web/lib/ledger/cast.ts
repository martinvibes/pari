// SPDX-License-Identifier: Apache-2.0

import "server-only";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CastKey, Persona } from "@/lib/pari/personas";
import { PERSONAS } from "@/lib/pari/personas";

export type Cast = Record<CastKey, string>;

export class CastMissingError extends Error {
  constructor(source: string) {
    super(`No demo cast found at ${source}. Run \`make seed\` with the sandbox up.`);
    this.name = "CastMissingError";
  }
}

/** The party ids written by the seed script: from PARI_CAST (JSON) or a file. */
export function loadCast(): Cast {
  if (process.env.PARI_CAST) return JSON.parse(process.env.PARI_CAST) as Cast;
  const file = resolve(process.cwd(), process.env.PARI_CAST_FILE ?? ".pari/cast.json");
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Cast;
  } catch {
    throw new CastMissingError(file);
  }
}

export function partyOf(cast: Cast, persona: Persona): string {
  return cast[persona.castKey];
}

/** The persona behind a party id, for naming parties on screen. */
export function personaOf(cast: Cast, party: string): Persona | undefined {
  return PERSONAS.find((p) => cast[p.castKey] === party);
}
