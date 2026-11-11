// The leak test. It reads what anyone can read (every transaction the scripts
// sent to the deal, and the contract's whole storage) and searches it for the
// deal's secrets in plaintext: each lender's position and payment, the trade's
// size and price, and the borrower's DQ list. It must find none.
//
// It needs no keys: `npm run prove:privacy` works from a fresh clone against
// the deal recorded in near/runs. With the parties' view keys on this machine
// it also opens the envelopes and shows the same search finds every secret
// there, so a clean result is not an empty search.

import { existsSync, readdirSync } from "node:fs";
import {
  accountOf,
  BUYER_CASH,
  FIRST_PERIOD_DUE,
  FIRST_PERIOD_TOTAL,
  LEDGER,
  money,
  PERSONAS,
  POSITIONS,
  TRADE,
  UNITS_PER_CENT,
  WITHDRAWAL,
} from "./lib/deal.js";
import { openEnvelope, state, view } from "./lib/ledger.js";
import { provider, txUrl } from "./lib/network.js";
import { readRun, RUNS_DIR, type RunEntry } from "./lib/runlog.js";
import { haveViewKeys, viewKeyFor } from "./lib/viewkeys.js";

const ATTESTATIONS = process.env.OUTLAYER_API ?? "https://testnet-api.outlayer.ai";

// ----- what is searched -----

/** Text with every base64 field decoded next to it, three levels deep: call
 *  arguments and return values are base64, and some carry JSON in JSON. */
function expand(text: string, depth = 3): string {
  if (depth === 0) return text;
  const decoded = (text.match(/[A-Za-z0-9+/]{16,}={0,2}/g) ?? []).map((run) => Buffer.from(run, "base64").toString("latin1"));
  return decoded.length === 0 ? text : `${text}\n${expand(decoded.join("\n"), depth - 1)}`;
}

/** The network's own fee figures. They are set by the protocol and by fixed
 *  gas allowances in the code, never by the deal, and a round one can equal a
 *  round amount: testnet's gas price is 1000000000, the trade's size in cents. */
const FEE_FIELDS = new Set(["gas", "gas_price", "gas_burnt", "tokens_burnt"]);
let feeFieldsSkipped = 0;

async function transactionText(entry: RunEntry): Promise<string> {
  const tx = await provider.viewTransactionStatusWithReceipts({ txHash: entry.hash, accountId: entry.signer, waitUntil: "FINAL" });
  const withoutFees = JSON.stringify(tx, (key, value) => {
    if (!FEE_FIELDS.has(key)) return value;
    feeFieldsSkipped += 1;
    return undefined;
  });
  return expand(withoutFees);
}

/** Every key and value the contract stores, as the RPC serves it to anyone. */
async function storageText(): Promise<{ keys: number; text: string }> {
  const { values } = await provider.viewContractState({ contractId: LEDGER, prefix: "" });
  return { keys: values.length, text: expand(JSON.stringify(values)) };
}

// ----- what is searched for -----

interface Secret {
  what: string;
  /** Every way the value could be written. */
  forms: string[];
  /** True earlier in the deal, so the latest envelopes no longer hold it. */
  past?: boolean;
}

/** An amount as the books write it (cents), as people write it, and as USDC base units. */
function amount(what: string, cents: bigint, past = false): Secret {
  const plain = `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
  return { what: `${what}: ${money(cents)}`, forms: [cents.toString(), plain, money(cents), (cents * UNITS_PER_CENT).toString()], past };
}

/** Counts `form` as a whole number or word, so 985833 inside 1985833 is not a hit. */
function count(text: string, form: string): number {
  const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (text.match(new RegExp(`(?<![0-9.,])${escaped}(?![0-9])`, "g")) ?? []).length;
}

function hits(text: string, secret: Secret): number {
  return secret.forms.reduce((sum, form) => sum + count(text, form), 0);
}

const name = (account: string) => account.split(".")[0]!.replace(/^./, (c) => c.toUpperCase());
const [alder, delta, rival] = [accountOf("alder"), accountOf("delta"), accountOf("rival")];

const alderCash = FIRST_PERIOD_DUE[alder]! - WITHDRAWAL;

const SECRETS: Secret[] = [
  ...Object.entries(POSITIONS).map(([lender, cents]) => amount(`${name(lender)}'s position`, cents, lender === alder)),
  ...Object.entries(FIRST_PERIOD_DUE).map(([lender, cents]) => amount(`${name(lender)}'s interest payment`, cents)),
  amount("the size of the trade", TRADE.par),
  amount("Alder's position after the trade", POSITIONS[alder]! - TRADE.par),
  amount("the cash Delta paid Alder", TRADE.cash),
  { what: "the trade price: 99.5", forms: [TRADE.price_ppm.toString(), "99.5", "0.995"] },
  amount("the interest Alder kept on the trade date", TRADE.seller_carried),
  amount("Alder's cash after its withdrawal", alderCash, true),
  amount("Alder's cash after the trade", alderCash + TRADE.cash),
  amount("Delta's cash after the trade", BUYER_CASH - TRADE.cash),
  { what: "the DQ list and screening results, by name", forms: ["dq_list", "screening", "on the DQ list"] },
];

/** Facts the design makes public. The search must find these, or it is not looking. */
const PUBLIC: Secret[] = [
  amount("the interest request's total", FIRST_PERIOD_TOTAL),
  amount("each buyer's deposit", BUYER_CASH),
  amount("Alder's withdrawal", WITHDRAWAL),
  { what: "who takes part (accounts)", forms: [alder, delta, rival] },
];

// ----- the run -----

function line(label: string, value: string): void {
  console.log(`  ${label.padEnd(58, " ")} ${value}`);
}

function fail(message: string): never {
  console.error(`\nFAIL: ${message}`);
  process.exit(1);
}

const dealId = process.argv[2] ?? latestRun();
const run = readRun(dealId) ?? fail(`no run recorded for deal ${dealId} in near/runs`);

console.log(`Leak test: deal ${run.deal_id} on ${run.ledger}\n`);
console.log("Reading what anyone can read");
const texts: { entry: RunEntry; text: string }[] = [];
for (const entry of run.transactions) texts.push({ entry, text: await transactionText(entry) });
const storage = await storageText();
const everything = [...texts.map((t) => t.text), storage.text].join("\n");
line(`${texts.length} transactions: arguments, logs, receipts, return values`, `${bytes(texts.reduce((n, t) => n + t.text.length, 0))}`);
line(`the contract's whole storage: ${storage.keys} keys`, bytes(storage.text.length));
line("left out: the network's own gas and fee figures", `${feeFieldsSkipped} fields`);

console.log("\nSecrets searched for, in every way they could be written");
let leaked = 0;
for (const secret of SECRETS) {
  const found = hits(everything, secret);
  leaked += found;
  line(secret.what, found === 0 ? "not found" : `FOUND ${found} times`);
}

// The DQ list is a list of accounts, and Rival's account is public for other
// reasons: it paid cash in, and every action writes an envelope for every
// party, Rival included. What must not show is the borrower's DQ transaction
// saying more about Rival than about Delta, who is not on the list.
const dqTx = texts.filter((t) => t.entry.step === "set_dq");
const named = (who: string) => dqTx.reduce((n, t) => n + count(t.text, who), 0);
const dqHits = Math.max(0, named("rival") - named("delta"));
leaked += dqHits;
line(
  "Rival in the DQ transaction, beyond its envelope slot",
  dqHits === 0 ? `not found (Rival ${named("rival")}, Delta ${named("delta")})` : `FOUND ${dqHits} times`,
);

console.log("\nPublic by design: the same search does find these");
for (const fact of PUBLIC) {
  const found = hits(everything, fact);
  line(fact.what, found > 0 ? `found ${found} times` : "NOT FOUND");
  if (found === 0) fail(`the search missed a public fact (${fact.what}), so a clean result would mean nothing`);
}

const deal = await state();
if (deal.deal_id !== run.deal_id) {
  console.log(`\nControl skipped: the contract has moved on to deal ${deal.deal_id}, so its envelopes are another deal's.`);
} else if (haveViewKeys(PERSONAS.map(accountOf))) {
  console.log("\nControl: the same search over the envelopes, opened with each party's own key");
  const opened: string[] = [];
  for (const persona of PERSONAS) {
    const account = accountOf(persona);
    opened.push(JSON.stringify(await openEnvelope<unknown>(account, await viewKeyFor(account))));
  }
  const current = SECRETS.filter((secret) => !secret.past);
  const inside = current.filter((secret) => hits(opened.join("\n"), secret) > 0).length;
  line("secrets found inside the opened envelopes", `${inside} of ${current.length}`);
  line("secrets from earlier in the deal, no longer in the books", `${SECRETS.length - current.length}`);
  if (inside !== current.length) fail("a secret was not in any envelope; the list of secrets is out of date");
} else {
  console.log("\nControl skipped: the parties' view keys are not on this machine (they never leave the demo server).");
}

console.log("\nThe enclave");
line("program on OutLayer", deal.project_id);
line("the one build the contract will run (sha256)", deal.version_key ?? "not pinned");
const attested = await attestations(run.transactions);
line("runs with an Intel TDX attestation from OutLayer", `${attested.length} of ${run.transactions.length} transactions`);
const others = attested.filter((a) => a.executed_wasm_sha256 !== deal.version_key || a.project_id !== deal.project_id);
line("of those, runs of any other build or program", others.length === 0 ? "none" : `${others.length}`);
const sample = attested.at(-1);
if (sample) {
  line("example", `${ATTESTATIONS}/attestations/by-tx/${sample.transaction_hash}`);
  line("  TDX quote", `${Buffer.from(sample.tdx_quote, "base64").length} bytes, worker measurement ${sample.worker_measurement.slice(0, 16)}…`);
  line("  transaction", txUrl(sample.transaction_hash));
}

if (leaked > 0) fail(`${leaked} secrets found in public data`);
if (others.length > 0) fail("a run was attested for a build the contract does not pin");
console.log(`\nPASS: 0 secrets in ${bytes(everything.length)} of public data.`);

// ----- helpers -----

function bytes(n: number): string {
  return `${n.toLocaleString("en-US")} bytes`;
}

/** The newest deal on this ledger that the end-to-end script played right through. */
function latestRun(): string {
  const deals = existsSync(RUNS_DIR) ? readdirSync(RUNS_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")) : [];
  const played = deals.filter((deal) => {
    const log = readRun(deal);
    return log?.ledger === LEDGER && log.transactions.some((t) => t.step === "settle_trade");
  });
  const newest = played.sort((a, b) => a.localeCompare(b, "en", { numeric: true })).at(-1);
  return newest ?? fail(`no full run recorded for ${LEDGER} in near/runs; run \`npm run e2e\` first`);
}

interface Attestation {
  transaction_hash: string;
  project_id: string;
  executed_wasm_sha256: string;
  worker_measurement: string;
  tdx_quote: string;
}

/** OutLayer's attestation record for each transaction that ran the enclave. */
async function attestations(entries: RunEntry[]): Promise<Attestation[]> {
  const found: Attestation[] = [];
  for (const entry of entries) {
    const response = await fetch(`${ATTESTATIONS}/attestations/by-tx/${entry.hash}`);
    if (response.ok) found.push((await response.json()) as Attestation);
  }
  return found;
}
