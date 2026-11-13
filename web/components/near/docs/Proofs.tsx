// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import { DocsHeader, DocsPager } from "@/components/DocsBlocks";

// The README's copy of the run, line for line.
const OUTPUT = `$ npm run verify:proof

Proof: …/near/proofs/northwind-14.json

What it says
  Party            alder.paridesk.testnet
  Deal             northwind-14, after action 30
  Fact             position
    accrual_start  2027-06-15
    carried        0.00
    principal      40,000,000.00

Checked, with no keys
  ✓ The fact and its salt hash to number 9 of the 12 hashes in the proof.
  ✓ At block 277320067 (2026-11-12 05:33 UTC) ledger.paridesk.testnet
    held the hash of that list as alder.paridesk.testnet's commitment.
  The other 11 hashes are salted. They show that the party's view holds 11 more facts, and nothing about them.
  This is still the party's latest view.

Control: the same proof with one digit of the fact changed
  ✓ Rejected: the fact, its salt and the list of hashes do not belong together.
  ✓ With its hash put into the list as well, so that the arithmetic agrees:
    rejected: at block 277320067 the chain did not hold this commitment for alder.paridesk.testnet.

PASS: the fact is what the enclave put in this party's view, and the proof shows no other.`;

export function Proofs() {
  return (
    <article>
      <DocsHeader
        kicker="Design"
        title="Prove one fact, and nothing else"
        summary="A party cuts a proof of one fact from its own envelope and hands it over as a link or a small file. The outsider checks it against NEAR with no key and no account."
      />

      <div className="docs-prose mt-8">
        <p>
          A lender sometimes has to show an outsider one thing from the books. A buyer wants to know
          the seller holds what it is selling. A fund&rsquo;s auditor wants to see one interest
          payment. A bank that lends against a position wants to see the position. Today that is a
          PDF from the agent. On a private ledger it usually means giving the outsider a seat on the
          ledger.
        </p>
        <p>
          In Pari the party cuts a <strong>proof</strong> from its own envelope. The agent is not
          asked, and nothing else in the envelope is shown.
        </p>

        <h2>How it works</h2>
        <ol>
          <li>
            Inside the enclave, each party&rsquo;s view is a list of facts: what it holds, its cash,
            each payment, each trade. For the agent, the borrower and the auditor the list also has
            the register and the outstanding total.
          </li>
          <li>
            With every action the enclave draws 32 new random bytes for each party, the seed, and
            puts them inside that party&rsquo;s sealed envelope. Each fact gets its own salt,
            HMAC-SHA256 of the fact&rsquo;s name under the seed, and is hashed with it (sha256). The
            sha256 of all those hashes together is the party&rsquo;s <strong>commitment</strong>.
            The contract stores it beside the envelope, where anyone can read it.
          </li>
          <li>
            A proof is one fact in the clear, its salt, the list of fact hashes and the number of
            the block it was cut at.
          </li>
          <li>
            To check it, hash the fact with its salt and find the result at its place in the list.
            Then hash the list and ask a NEAR archival node what <code>envelope(party)</code>{" "}
            returned at that block. The two commitments must be equal.
          </li>
        </ol>
        <p>
          The check reads the chain as it was at the proof&rsquo;s block, so a proof stays checkable
          after the deal has moved on. The page says whether it is still the party&rsquo;s latest
          view.
        </p>

        <h2>Try it</h2>
        <p>
          On your own deployment, after step 6 of the walk in{" "}
          <Link href="/docs/quickstart">Check it yourself</Link>:
        </p>
        <ol>
          <li>
            Open <code>/lender/alder</code>. In the payments table, press <strong>Prove</strong>{" "}
            beside the settled payment. You land on <code>/verify</code> and see{" "}
            <strong>It holds</strong>:{" "}
            <em>
              Alder was paid 985,833.33 of the 985,833.33 it was owed for interest to 15 Dec 2026.
            </em>{" "}
            The page&rsquo;s address is the proof: anyone you send it to sees the same page, and the
            server uses no key to draw it.
          </li>
          <li>
            In the box <strong>The proof</strong>, change one digit of <code>&quot;paid&quot;</code>{" "}
            and press <strong>Check against NEAR</strong>. You see{" "}
            <strong>It does not hold</strong>:{" "}
            <em>The fact, its salt and the list of hashes do not belong together.</em>
          </li>
          <li>
            Back on <code>/lender/alder</code>, under the sealed envelope,{" "}
            <strong>Prove what you hold</strong> and <strong>Prove your cash</strong> do the same
            for those two facts. <code>/agent</code>, <code>/borrower</code> and{" "}
            <code>/auditor</code> have <strong>Prove the register</strong> and{" "}
            <strong>Prove the outstanding total</strong>.
          </li>
          <li>
            In a terminal, <code>npm run e2e</code> leaves the proof of what Alder holds in{" "}
            <code>near/proofs</code>, and <code>npm run verify:proof</code> checks it with no keys.
            It then changes one digit and shows the proof rejected, and forges the changed
            fact&rsquo;s hash into the list and shows the chain&rsquo;s commitment reject that too.
          </li>
        </ol>

        <h2>Checked from a fresh clone</h2>
        <p>
          This is <code>npm run verify:proof</code> with no keys, on the proof the recorded run of{" "}
          <code>northwind-14</code> left:
        </p>
        <pre>{OUTPUT}</pre>

        <h2>What a proof shows besides its fact</h2>
        <p>
          The party&rsquo;s account, the deal, the number of the action the view is from, and how
          many facts the party&rsquo;s view holds. The other facts are in the proof as salted hashes
          only. The salts are new with every action and come from a seed only the party can read, so
          a hash cannot be matched against a guess (&ldquo;is Alder&rsquo;s cash 485,833.33?&rdquo;)
          or against an older proof. The proof Alder cuts of what it holds contains no payment, no
          cash balance, no price and no other party&rsquo;s name; <code>npm run e2e</code> checks
          exactly that.
        </p>

        <h2>What a proof is not</h2>
        <p>
          It is not a signature and it is not zero-knowledge: the fact is shown in the clear to
          whoever holds the proof, and they can pass it on. Its weight comes from the chain: the
          rules contract stored that commitment from the answer of the one enclave build it pins. It
          says what the party&rsquo;s view held at one block, not what is true today.
        </p>

        <h2>Two programs that must agree</h2>
        <p>
          The enclave and the checker are written separately, in Rust and in TypeScript. One enclave
          test, <code>test_the_enclave_and_the_proof_checker_agree_on_a_known_view</code>, holds the
          enclave to the salt, the hash and the commitment the TypeScript checker computed for a
          known view. And on every load <code>/visibility</code> recomputes each party&rsquo;s
          commitment in TypeScript from its opened envelope and compares it with the chain&rsquo;s:
          the eighth claim under <strong>Checked live</strong>.
        </p>
      </div>

      <DocsPager current="/docs/proofs" />
    </article>
  );
}
