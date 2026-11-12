// SPDX-License-Identifier: Apache-2.0

// The demo deal's cast. Each persona is one Canton party; the app reads the
// ledger as that party, so every screen shows exactly what it can see.

export type Role = "agent" | "borrower" | "lender" | "auditor";

/** Keys of the cast file the seed script writes (Pari.Test.Setup.Cast). */
export type CastKey =
  | "registry"
  | "agent"
  | "borrower"
  | "alder"
  | "birch"
  | "cedar"
  | "buyer"
  | "rival"
  | "auditor";

/** Where a party sits at the deal table. Buyers use the lender screen (a buyer
 *  is a lender once it buys in), but sit apart so the cast reads at a glance. */
export type Seat = "agent" | "borrower" | "lender" | "buyer" | "auditor";

export const SEATS: Array<{ seat: Seat; label: string }> = [
  { seat: "agent", label: "Agent" },
  { seat: "borrower", label: "Borrower" },
  { seat: "lender", label: "Lenders" },
  { seat: "buyer", label: "Buyers" },
  { seat: "auditor", label: "Auditor" },
];

export type Persona = {
  id: string;
  name: string;
  role: Role;
  seat: Seat;
  castKey: CastKey;
  href: string;
  blurb: string;
  /** What this party's own key opens, in one line. */
  reads: string;
};

export const PERSONAS: Persona[] = [
  { id: "agent", name: "Agent", role: "agent", seat: "agent", castKey: "agent", href: "/agent", blurb: "Administrative agent",
    reads: "The whole register, every trade with its price, and screening results" },
  { id: "northwind", name: "Northwind", role: "borrower", seat: "borrower", castKey: "borrower", href: "/borrower", blurb: "Borrower",
    reads: "The whole register and every trade without its price; keeps the DQ list" },
  { id: "alder", name: "Alder", role: "lender", seat: "lender", castKey: "alder", href: "/lender/alder", blurb: "Lender, private side",
    reads: "Its own line, its own payments and its own trades" },
  { id: "birch", name: "Birch", role: "lender", seat: "lender", castKey: "birch", href: "/lender/birch", blurb: "Lender, public side",
    reads: "Its own line, its own payments and its own trades" },
  { id: "cedar", name: "Cedar", role: "lender", seat: "lender", castKey: "cedar", href: "/lender/cedar", blurb: "Lender, public side",
    reads: "Its own line, its own payments and its own trades" },
  { id: "delta", name: "Delta", role: "lender", seat: "buyer", castKey: "buyer", href: "/lender/delta", blurb: "Fund buying in",
    reads: "Its own trades, and its own line once it buys in" },
  { id: "rival", name: "Rival", role: "lender", seat: "buyer", castKey: "rival", href: "/lender/rival", blurb: "On the DQ list",
    reads: "Its own trades; not the DQ list it is on" },
  { id: "auditor", name: "Auditor", role: "auditor", seat: "auditor", castKey: "auditor", href: "/auditor", blurb: "The borrower's auditor",
    reads: "The whole register and every payment; no price, no DQ list" },
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
