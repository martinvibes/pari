// The demo deal and its cast, from daml/pari-tests/daml/Pari/Test/Setup.daml.
// Money is always whole cents in a bigint.

export const ROOT = process.env.PARI_ROOT ?? "paridesk.testnet";
export const OUTLAYER = process.env.OUTLAYER_CONTRACT ?? "outlayer.testnet";
export const PROJECT_NAME = "pari-core";
export const PROJECT_ID = `${ROOT}/${PROJECT_NAME}`;

export const LEDGER = `ledger.${ROOT}`;
export const USDC = `usdc.${ROOT}`;

/** Sputnik DAO's factory on testnet (docs.near.org/primitives/dao). */
export const DAO_FACTORY = "sputnikv2.testnet";
/** The agent as a DAO, for a deal set up with --dao: three operators, and two
 *  of them must approve each of the agent's actions. */
export const DAO = `${ROOT.replace(/\.testnet$/, "").replaceAll(".", "-")}-agent.${DAO_FACTORY}`;
export const OPERATORS = ["op1", "op2", "op3"].map((name) => `${name}.${ROOT}`);

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
  northwind: 25_000_000_00n,
  delta: 20_000_000_00n,
  rival: 20_000_000_00n,
};

/** First-period interest at 7.80% for 91 days: what each lender is owed, in cents. */
export const FIRST_PERIOD_DUE: Record<string, bigint> = {
  [accountOf("alder")]: 985_833_33n,
  [accountOf("birch")]: 591_500_00n,
  [accountOf("cedar")]: 394_333_33n,
};
export const FIRST_PERIOD_TOTAL = 1_971_666_66n;
/** What the agent types by mistake: Revlon's $900m. */
export const MISTYPED_TOTAL = 900_000_000_00n;
/** Alder takes part of its interest out as USDC. Withdrawals are public. */
export const WITHDRAWAL = 500_000_00n;

export const SECOND_PERIOD_END = "2027-03-15";
/** Alder sells 10m to Delta at 99.5, thirty days into the second period. */
export const TRADE = {
  date: "2027-01-14",
  par: 10_000_000_00n,
  price_ppm: 995_000,
  cash: 9_950_000_00n,
  /** Interest Alder earned up to the trade date and keeps: 30 days on 50m. */
  seller_carried: 325_000_00n,
};
/** What each buyer pays into the deal before trading. Deposits are public. */
export const BUYER_CASH = 12_000_000_00n;

/** Second-period interest at 7.80% for 90 days, after the trade. Alder is owed
 *  what it kept to the trade date plus 60 days on 40m; Delta, 60 days on 10m. */
export const SECOND_PERIOD_DUE: Record<string, bigint> = {
  [accountOf("alder")]: 845_000_00n,
  [accountOf("birch")]: 585_000_00n,
  [accountOf("cedar")]: 390_000_00n,
  [accountOf("delta")]: 130_000_00n,
};
export const SECOND_PERIOD_TOTAL = 1_950_000_00n;
/** The borrower pays half of it. Every lender gets half of what it is owed,
 *  and the other half stays owed. */
export const SHORT_PAYMENT = 975_000_00n;

export const THIRD_PERIOD_END = "2027-06-15";
/** Third-period interest at 7.80% for 92 days, plus the half left unpaid. */
export const THIRD_PERIOD_DUE: Record<string, bigint> = {
  [accountOf("alder")]: 1_219_833_33n,
  [accountOf("birch")]: 890_500_00n,
  [accountOf("cedar")]: 593_666_66n,
  [accountOf("delta")]: 264_333_33n,
};
export const THIRD_PERIOD_TOTAL = 2_968_333_32n;

/** Test USDC has 6 decimals; the books keep cents. */
export const UNITS_PER_CENT = 10_000n;

/** `198583333n` -> `"1,985,833.33"`. */
export function money(cents: bigint): string {
  const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${whole}.${(cents % 100n).toString().padStart(2, "0")}`;
}
