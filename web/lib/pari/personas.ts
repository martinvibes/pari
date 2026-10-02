// SPDX-License-Identifier: Apache-2.0

// The demo deal's cast. Each persona is one Canton party; the app reads the
// ledger as that party, so every screen shows exactly what it can see.

export type Role = "agent" | "borrower" | "lender";

/** Keys of the cast file the seed script writes (Pari.Test.Setup.Cast). */
export type CastKey = "registry" | "agent" | "borrower" | "alder" | "birch" | "cedar" | "buyer" | "rival";

export type Persona = {
  id: string;
  name: string;
  role: Role;
  castKey: CastKey;
  href: string;
  blurb: string;
};

export const PERSONAS: Persona[] = [
  { id: "agent", name: "Agent", role: "agent", castKey: "agent", href: "/agent", blurb: "Administrative agent" },
  { id: "northwind", name: "Northwind", role: "borrower", castKey: "borrower", href: "/borrower", blurb: "Borrower" },
  { id: "alder", name: "Alder", role: "lender", castKey: "alder", href: "/lender/alder", blurb: "Lender, private side" },
  { id: "birch", name: "Birch", role: "lender", castKey: "birch", href: "/lender/birch", blurb: "Lender, public side" },
  { id: "cedar", name: "Cedar", role: "lender", castKey: "cedar", href: "/lender/cedar", blurb: "Lender, public side" },
  { id: "delta", name: "Delta", role: "lender", castKey: "buyer", href: "/lender/delta", blurb: "Fund buying in" },
  { id: "rival", name: "Rival", role: "lender", castKey: "rival", href: "/lender/rival", blurb: "On the DQ list" },
];

export const LENDERS = PERSONAS.filter((p) => p.role === "lender");

export function personaById(id: string): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}

/** A persona the app names itself; an unknown id is a programming error. */
export function persona(id: string): Persona {
  const found = personaById(id);
  if (!found) throw new Error(`Unknown persona: ${id}`);
  return found;
}
