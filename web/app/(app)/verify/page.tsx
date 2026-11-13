// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Party } from "@/components/app/party";
import { PageHeader, Panel, Tag } from "@/components/app/ui";
import { Explore, NearUnavailable, short } from "@/components/near/parts";
import { BACKEND } from "@/lib/backend";
import { accountUrl, NEAR } from "@/lib/near/config";
import { checkProof, decodeProof, type Verdict } from "@/lib/near/disclosure";
import type { Fact, Proof } from "@/lib/near/proofs";
import { nameOf, unavailable } from "@/lib/near/session";
import { formatDate } from "@/lib/pari/dates";
import { formatCents } from "@/lib/pari/money";

export const metadata: Metadata = { title: "Check a proof" };

const IRIS = "#A78BFA";

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
    <div className="space-y-12">
      <PageHeader
        kicker="Selective disclosure"
        title="Check a proof"
        accent={IRIS}
        lede="A party can hand anyone one fact from its sealed envelope: what it holds, or one payment it received. This page checks that fact against NEAR. It uses no key, and the proof shows nothing else from the envelope."
      />

      {verdict ? <Checked verdict={verdict} proof={proof} /> : null}

      <Panel
        title={verdict ? "The proof" : "Paste a proof"}
        note={
          verdict
            ? "Everything the outsider was handed. Change one digit of the fact and check again: it stops holding."
            : "A party makes one on its own screen: open a lender, and press Prove next to a payment or under its envelope."
        }
      >
        <form method="get" action="/verify" className="space-y-4">
          <textarea
            name="proof"
            rows={verdict ? 14 : 6}
            defaultValue={proof ? JSON.stringify(proof, null, 2) : given}
            spellCheck={false}
            aria-label="The proof"
            className="field !mt-0 font-mono !text-[12px] !font-normal leading-6"
            required
          />
          <button type="submit" className="btn-ghost">
            Check against NEAR
          </button>
        </form>
      </Panel>
    </div>
  );
}

function Checked({ verdict, proof }: { verdict: Verdict; proof: Proof | null }) {
  const { fact } = verdict;
  if (!verdict.holds) {
    return (
      <Panel title="It does not hold" note={verdict.why} aside={<Tag tone="stop">Does not hold</Tag>}>
        {fact ? (
          <div className="space-y-4">
            <p className="label-data">What it claims, unproved</p>
            <p className="max-w-prose text-[17px] leading-relaxed text-pewter">{sentence(fact)}</p>
          </div>
        ) : (
          <p className="text-[15px] text-pewter">Nothing in it can be relied on.</p>
        )}
      </Panel>
    );
  }
  const { at, latest, others } = verdict;
  const count = others + 1;
  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <Panel
        title="It holds"
        note={`Deal ${verdict.fact.deal}, after action #${verdict.fact.seq}.`}
        aside={<Tag tone="ok">Holds</Tag>}
        className="lg:col-span-7"
      >
        <p className="max-w-prose text-2xl font-medium leading-snug tracking-tight text-paper">{sentence(verdict.fact)}</p>
        <dl className="space-y-2">
          <Line label="Party">
            <Party name={nameOf(verdict.fact.party)} /> <span className="ml-2 font-mono text-[12px] text-ash">{verdict.fact.party}</span>
          </Line>
          {lines(verdict.fact).map(([label, value]) => (
            <Line key={label} label={label}>
              {value}
            </Line>
          ))}
        </dl>
      </Panel>

      <Panel title="How it was checked" note="Two steps anyone can repeat: npm run verify:proof in near/scripts does the same." className="lg:col-span-5">
        <ol className="space-y-4 text-[14px] leading-relaxed text-smoke">
          <li>
            <span className="text-mint">✓</span> The fact and its salt hash to entry {(proof?.index ?? 0) + 1} of the {count} in the proof.
          </li>
          <li>
            <span className="text-mint">✓</span> The hash of those {count} entries is the commitment that{" "}
            <Explore href={accountUrl(NEAR.ledger)}>{NEAR.ledger}</Explore> held for this party at block {proof?.block}, on {when(at)}:{" "}
            <span className="font-mono text-[12px] text-pewter">{short(verdict.commitment)}</span>.
          </li>
          <li className="text-pewter">
            {latest ? "This is still the party's latest view." : "The deal has moved on since. The proof is of that block, and stays checkable."}
          </li>
        </ol>
        <div className="space-y-2 border-t border-white/10 pt-5">
          <p className="label-data">What it does not show</p>
          <p className="text-[13px] leading-relaxed text-pewter">
            The other {others} entries are salted hashes. They show that the party&apos;s view holds {others} more facts, and nothing about any
            of them. The enclave draws new salts with every action, so a hash cannot be matched against an older proof or guessed from a list
            of likely amounts.
          </p>
        </div>
      </Panel>
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-t border-white/[0.07] pt-2">
      <dt className="label-data">{label}</dt>
      <dd className="text-right text-[15px] tabular-nums text-smoke">{children}</dd>
    </div>
  );
}
