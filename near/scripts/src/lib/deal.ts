// The demo deal and its cast, from daml/pari-tests/daml/Pari/Test/Setup.daml.
// Money is always whole cents in a bigint.

export const ROOT = process.env.PARI_ROOT ?? "paridesk.testnet";
export const OUTLAYER = process.env.OUTLAYER_CONTRACT ?? "outlayer.testnet";
export const PROJECT_NAME = "pari-core";
export const PROJECT_ID = `${ROOT}/${PROJECT_NAME}`;

export const LEDGER = `ledger.${ROOT}`;
export const USDC = `usdc.${ROOT}`;

export const PERSONAS = ["agent", "northwind", "alder", "birch", "cedar", "delta", "rival", "auditor"] as const;
export type Persona = (typeof PERSONAS)[number];

export function accountOf(persona: Persona): string {
  return `${persona}.${ROOT}`;
}

export const TERMS = {
  facility_id: "NORTHWIND-TLB-2026",
  name: "Northwind Logistics Term Loan B",
  margin_bps: 350,
  closing: "2026-09-15",
  maturity: "2031-09-15",
};

export const BASE_RATE_BPS = 430;
export const MID_PERIOD = "2026-10-15";
export const FIRST_PERIOD_END = "2026-12-15";

/** Opening positions, in cents. */
export const POSITIONS: Record<string, bigint> = {
  [accountOf("alder")]: 50_000_000_00n,
  [accountOf("birch")]: 30_000_000_00n,
  [accountOf("cedar")]: 20_000_000_00n,
};

/** Test USDC minted to each party at setup, in cents. */
export const FUNDING: Partial<Record<Persona, bigint>> = {
  northwind: 5_000_000_00n,
  delta: 20_000_000_00n,
  rival: 20_000_000_00n,
};

/** Test USDC has 6 decimals; the books keep cents. */
export const UNITS_PER_CENT = 10_000n;

/** `198583333n` -> `"1,985,833.33"`. */
export function money(cents: bigint): string {
  const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${whole}.${(cents % 100n).toString().padStart(2, "0")}`;
}
