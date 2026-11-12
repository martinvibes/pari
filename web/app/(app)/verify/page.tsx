// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Lit, Screen } from "@/components/app/Screen";
import { Party } from "@/components/app/party";
import { Panel, Tag } from "@/components/app/ui";
import { Explore, NearUnavailable, short } from "@/components/near/parts";
import { BACKEND } from "@/lib/backend";
import { accountUrl, NEAR } from "@/lib/near/config";
import { checkProof, decodeProof, type Verdict } from "@/lib/near/disclosure";
import type { Fact, Proof } from "@/lib/near/proofs";
import { nameOf, unavailable } from "@/lib/near/session";
import { formatDate } from "@/lib/pari/dates";
import { formatCents } from "@/lib/pari/money";

export const metadata: Metadata = { title: "Check a proof" };

// A proof is one fact from one party's sealed view. This page checks it the
// way an outsider would: it uses no key, and asks NEAR what anyone can ask.

/** Fields the books keep in cents, and maps whose every value is cents. */
const CENTS = new Set(["principal", "carried", "due", "paid", "par", "cash", "interest_due", "outstanding", "total", "funded"]);
const CENT_MAPS = new Set(["legs", "paid"]);

/** A value from the books as a person reads it. */
function say(key: string, value: unknown, money = CENTS.has(key)): string {
  if (value === null || value === undefined) return "none";
  if (typeof value === "string") {
    if (money && /^\d+$/.test(value)) return formatCents(BigInt(value));
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(value) : value;
  }
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return value.map((entry) => say(key, entry, money)).join("; ");
  return Object.entries(value)
    .map(([field, entry]) => `${words(field)} ${say(field, entry, CENTS.has(field) || CENT_MAPS.has(key))}`)
    .join(", ");
}

/** `accrual_start` → "accrual start"; an account stays as it is. */
function words(field: string): string {
  return field.includes(".") ? nameOf(field) : field.replace(/_/g, " ");
}

/** The fact as one sentence, for the kinds a party is most likely to show. */
function sentence(fact: Fact): string {
  const who = nameOf(fact.party);
  const value = (fact.value ?? {}) as Record<string, unknown>;
  const [kind] = fact.item.split(".");
  switch (kind) {
    case "position":
      return fact.value === null ? `${who} holds none of the loan.` : `${who} holds ${say("principal", value.principal)} of the loan.`;
    case "cash":
      return `${who} has ${say("cash", fact.value)} of cash in the books.`;
    case "payments":
      return value.paid === null || value.paid === undefined
        ? `${who} is owed ${say("due", value.due)} of interest to ${say("period_end", value.period_end)}.`
        : `${who} was paid ${say("paid", value.paid)} of the ${say("due", value.due)} it was owed for interest to ${say("period_end", value.period_end)}.`;
    case "outstanding":
      return `The loan's outstanding principal is ${say("outstanding", fact.value)}, as ${who}'s view has it.`;
    case "register":
      return `The register, as ${who}'s view has it: every lender's principal.`;
    default:
      return `${who}'s view holds this ${words(kind ?? fact.item)}.`;
  }
}

/** The fact's fields, one per line. */
function lines(fact: Fact): Array<[string, string]> {
  if (fact.value === null || typeof fact.value !== "object" || Array.isArray(fact.value)) return [[words(fact.item), say(fact.item, fact.value)]];
  return Object.entries(fact.value).map(([field, entry]) => [words(field), say(field, entry, CENTS.has(field) || CENT_MAPS.has(fact.item))]);
}

function when(at: Date): string {
  return `${at.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export default async function VerifyPage({ searchParams }: { searchParams: { proof?: string | string[] } }) {
  if (BACKEND !== "near") notFound();
  const given = typeof searchParams.proof === "string" ? searchParams.proof.trim() : "";
  const proof = given ? decodeProof(given) : null;
  let verdict: Verdict | null = null;
  try {
    verdict = proof ? await checkProof(proof) : given ? { holds: false, why: "This is not a proof: it could not be read." } : null;
  } catch (error) {
    return <NearUnavailable problem={unavailable(error)} />;
  }

  return (
    <Screen title="Check a proof" context="One fact from one sealed envelope, checked against NEAR with no key">
      {verdict ? (
        <Checked verdict={verdict} proof={proof} />
      ) : (
        <Lit className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
          <Paste given={given} proof={proof} rows={7} solid />
          <div className="border-t border-white/[0.08] p-6 lg:border-l lg:border-t-0">
            <p className="text-[12.5px] text-pewter">Where a proof comes from</p>
            <p className="mt-2 text-[24px] font-light leading-[1.2] tracking-[-0.015em] text-paper">A party cuts one from its own envelope.</p>
            <p className="mt-3 text-[13px] leading-relaxed text-pewter">
              Sit at a lender&apos;s desk and press Prove next to a payment, or in the chain&apos;s column. The proof shows that one fact and nothing
              else from the envelope.
            </p>
          </div>
        </Lit>
      )}
      {verdict ? (
        <Panel title="The proof" aside="Change one digit of the fact and check again: it stops holding">
          <Paste given={given} proof={proof} rows={12} />
        </Panel>
      ) : null}
    </Screen>
  );
}

function Paste({ given, proof, rows, solid = false }: { given: string; proof: Proof | null; rows: number; solid?: boolean }) {
  return (
    <form method="get" action="/verify" className={solid ? "space-y-4 p-6" : "space-y-3"}>
      {solid ? <h2 className="text-[17px] font-medium leading-6 text-paper">Paste a proof</h2> : null}
      <textarea
        name="proof"
        rows={rows}
        defaultValue={proof ? JSON.stringify(proof, null, 2) : given}
        spellCheck={false}
        aria-label="The proof"
        className="field !mt-0 font-mono !text-[12px] leading-6"
        required
      />
      <button type="submit" className={solid ? "btn-solid sm:w-64" : "btn-ghost h-11 px-5"}>
        Check against NEAR
      </button>
    </form>
  );
}

function Checked({ verdict, proof }: { verdict: Verdict; proof: Proof | null }) {
  const { fact } = verdict;
  if (!verdict.holds) {
    return (
      <Lit tone="stop" className="p-6">
        <Tag tone="stop">Does not hold</Tag>
        <p className="mt-3 text-[44px] font-light leading-[1.05] tracking-[-0.025em] text-paper">Not proved.</p>
        <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-smoke">{verdict.why}</p>
        <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-pewter">
          {fact ? `What it claims, unproved: ${sentence(fact)}` : "Nothing in it can be relied on."}
        </p>
      </Lit>
    );
  }
  const { at, latest, others } = verdict;
  const count = others + 1;
  return (
    <Lit className="grid lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="p-6">
        <Tag tone="ok">Holds</Tag>
        <p className="mt-3 max-w-xl text-[28px] font-light leading-[1.2] tracking-[-0.02em] text-paper">{sentence(verdict.fact)}</p>
        <dl className="mt-5 text-[13.5px]">
          <Line label="Party">
            <Party name={nameOf(verdict.fact.party)} /> <span className="fig ml-2 text-[12px] text-ash">{verdict.fact.party}</span>
          </Line>
          {lines(verdict.fact).map(([label, value]) => (
            <Line key={label} label={label}>
              {value}
            </Line>
          ))}
          <Line label="Deal, and the action it follows">
            {verdict.fact.deal}, #{verdict.fact.seq}
          </Line>
        </dl>
      </div>
      <div className="border-t border-white/[0.08] p-6 lg:border-l lg:border-t-0">
        <h3 className="text-[13.5px] font-medium text-paper">How it was checked</h3>
        <ol className="mt-3 space-y-3 text-[13px] leading-relaxed text-smoke">
          <li>
            <span className="text-mint">✓</span> The fact and its salt hash to entry {(proof?.index ?? 0) + 1} of the {count} in the proof.
          </li>
          <li>
            <span className="text-mint">✓</span> The hash of those {count} entries is the commitment that{" "}
            <Explore href={accountUrl(NEAR.ledger)}>{NEAR.ledger}</Explore> held for this party at block {proof?.block}, on {when(at)}:{" "}
            <span className="fig text-[12px] text-pewter">{short(verdict.commitment)}</span>.
          </li>
          <li className="text-pewter">
            {latest ? "This is still the party's latest view." : "The deal has moved on since. The proof is of that block, and stays checkable."}
          </li>
        </ol>
        <p className="mt-4 border-t border-white/[0.08] pt-4 text-[12.5px] leading-relaxed text-ash">
          The other {others} entries are salted hashes: they show that the view holds {others} more facts, and nothing about any of them. Anyone
          can repeat this with npm run verify:proof in near/scripts.
        </p>
      </div>
    </Lit>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-t border-white/[0.08] py-2">
      <dt className="text-pewter">{label}</dt>
      <dd className="fig text-right text-paper">{children}</dd>
    </div>
  );
}
