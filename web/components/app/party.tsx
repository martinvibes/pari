// SPDX-License-Identifier: Apache-2.0

import { PERSONAS } from "@/lib/pari/personas";

// Each party in the deal has an identity hue, so a name reads the same on
// every screen: the tabs, the register, the trades and the privacy matrix.
// Hues are for recognition only. A status always says its state in words, in
// the signal colours (Tag), never in a party's hue.
const HUES: Record<string, string> = {
  agent: "#FFC857",
  northwind: "#7AA2FF",
  alder: "#9BE15D",
  birch: "#D08CFF",
  cedar: "#FF8FB1",
  delta: "#22D3EE",
  rival: "#FF7A45",
  auditor: "#E9D3A8",
};

const UNKNOWN = "#6E6E76";

/** A persona's hue by id, e.g. for the active tab. */
export function hueOf(personaId: string): string {
  return HUES[personaId] ?? UNKNOWN;
}

/** A party's hue by display name, as `View.name` returns it. */
export function hueOfName(name: string): string {
  const persona = PERSONAS.find((p) => p.name === name);
  return persona ? hueOf(persona.id) : UNKNOWN;
}

/** The identity dot alone. */
export function PartyDot({ name, className = "" }: { name: string; className?: string }) {
  const hue = hueOfName(name);
  return (
    <span
      aria-hidden
      className={`inline-block h-2 w-2 shrink-0 rounded-pill ${className}`}
      style={{ background: hue, boxShadow: `0 0 10px ${hue}80` }}
    />
  );
}

/** A party's name with its identity dot. */
export function Party({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <PartyDot name={name} />
      {name}
    </span>
  );
}
