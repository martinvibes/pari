// Checks a proof the way an outsider would. It needs no keys:
// `npm run verify:proof` works from a fresh clone.
//
// A proof is one fact from one party's sealed view: what a lender holds, or one
// payment it received. The party cuts it from its own envelope and hands it
// over. This script hashes the fact with its salt, finds the result in the
// proof's list of hashes, hashes the list, and asks NEAR whether the rules
// contract held that hash as the party's commitment.
//
// With no argument it checks the proof the end-to-end run left in near/proofs:
// Alder showing what it holds of the loan, and nothing else.
// `npm run verify:proof -- some.json` checks another.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { LEDGER, money } from "./lib/deal.js";
import { checkProof } from "./lib/ledger.js";
import { factHash, type Proof } from "./lib/proofs.js";
import { PROOFS_DIR, proofFile } from "./lib/runlog.js";

/** Fields the books keep in cents. */
const CENTS = new Set(["principal", "carried", "due", "paid", "par", "cash", "interest_due", "outstanding", "total", "funded"]);

function fail(message: string): never {
  console.error(`\nFAIL: ${message}`);
  process.exit(1);
}

function line(label: string, value: string): void {
  console.log(`  ${label.padEnd(16, " ")} ${value}`);
}

function shown(field: string, value: unknown): string {
  if (typeof value !== "string") return JSON.stringify(value);
  return CENTS.has(field) && /^\d+$/.test(value) ? money(BigInt(value)) : value;
}

/** The newest proof in near/proofs that names this ledger. */
function latestProof(): string {
  const deals = existsSync(PROOFS_DIR) ? readdirSync(PROOFS_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")) : [];
  const mine = deals.filter((deal) => (JSON.parse(readFileSync(proofFile(deal), "utf8")) as Proof).ledger === LEDGER);
  const newest = mine.sort((a, b) => a.localeCompare(b, "en", { numeric: true })).at(-1);
  return newest ? proofFile(newest) : fail(`no proof for ${LEDGER} in near/proofs; run \`npm run e2e\` first, or name a file`);
}

/** The same proof saying something else: the last digit of the fact is changed. */
function changed(proof: Proof): Proof {
  return { ...proof, fact: proof.fact.replace(/\d(?=\D*$)/, (digit) => String((Number(digit) + 1) % 10)) };
}

const path = process.argv[2] ?? latestProof();
const proof = JSON.parse(readFileSync(path, "utf8")) as Proof;
console.log(`Proof: ${path}\n`);

const verdict = await checkProof(proof);
if (!verdict.holds) fail(verdict.why);
const { fact, at, latest } = verdict;

console.log("What it says");
line("Party", fact.party);
line("Deal", `${fact.deal}, after action ${fact.seq}`);
line("Fact", fact.item);
const value = fact.value !== null && typeof fact.value === "object" ? Object.entries(fact.value) : [[fact.item, fact.value] as const];
for (const [field, entry] of value) line(`  ${field}`, shown(field, entry));

const others = proof.hashes.length - 1;
console.log("\nChecked, with no keys");
console.log(`  ✓ The fact and its salt hash to number ${proof.index + 1} of the ${proof.hashes.length} hashes in the proof.`);
console.log(`  ✓ At block ${proof.block} (${at.toISOString().slice(0, 16).replace("T", " ")} UTC) ${proof.ledger}`);
console.log(`    held the hash of that list as ${fact.party}'s commitment.`);
console.log(`  The other ${others} hashes are salted. They show that the party's view holds ${others} more facts, and nothing about them.`);
console.log(latest ? "  This is still the party's latest view." : "  The deal has moved on since; the proof is of that block.");

console.log("\nControl: the same proof with one digit of the fact changed");
const altered = changed(proof);
const first = await checkProof(altered);
if (first.holds) fail("a changed fact was accepted");
console.log(`  ✓ Rejected: ${first.why}.`);
const forged = { ...altered, hashes: proof.hashes.map((hash, index) => (index === proof.index ? factHash(altered.salt, altered.fact) : hash)) };
const second = await checkProof(forged);
if (second.holds) fail("a forged proof was accepted");
console.log("  ✓ With its hash put into the list as well, so that the arithmetic agrees:");
console.log(`    rejected: ${second.why}.`);

console.log("\nPASS: the fact is what the enclave put in this party's view, and the proof shows no other.");
