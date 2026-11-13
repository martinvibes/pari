// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import { DocsHeader, DocsPager } from "@/components/DocsBlocks";
import { NEAR } from "@/lib/near/config";

export function HowItRuns() {
  return (
    <article>
      <DocsHeader
        kicker="Concepts"
        title="How an action runs"
        summary="A party signs a NEAR transaction. The rules contract checks it, runs the books inside the enclave, checks the answer and stores what comes back."
      />

      <div className="docs-prose mt-8">
        <h2>Nine steps</h2>
        <p>
          Take the agent requesting interest. It signs a NEAR transaction that calls{" "}
          <code>request_interest</code> on <code>{NEAR.ledger}</code> with the total it typed.
        </p>
        <h3>The rules contract</h3>
        <ol>
          <li>Is the caller the agent?</li>
          <li>One action at a time (a lock).</li>
          <li>Run the one pinned build of the enclave program, and tell it who called.</li>
        </ol>
        <h3>The books, inside the Intel TDX enclave on OutLayer</h3>
        <ol start={4}>
          <li>Open the books from encrypted storage.</li>
          <li>Apply the deal&rsquo;s rules, or refuse.</li>
          <li>
            Save the books; seal one envelope per party and hash the facts in it. Hand back the new
            fingerprint, the public totals, and one sealed envelope and one commitment per party.
          </li>
        </ol>
        <h3>The rules contract again</h3>
        <ol start={7}>
          <li>Check the money rules again, without trusting the enclave.</li>
          <li>Store the fingerprint, the envelopes and the commitments.</li>
          <li>Pay out test USDC (withdrawals), and tell the party: done, or refused.</li>
        </ol>
        <p>
          Steps 3 to 6 are one NEAR transaction: the contract calls OutLayer, waits (NEAR&rsquo;s
          yield/resume), and gets the answer in a callback.
        </p>

        <h2>What comes back</h2>
        <p>
          A <strong>fingerprint</strong> of the new books (a sha256, with 32 fresh random bytes
          hashed in) and, for each party, one <strong>sealed envelope</strong>, encrypted so only
          that party can open it, and one <strong>commitment</strong>: a salted hash of the facts
          inside that envelope. The contract stores all three. A party can use the commitment to{" "}
          <Link href="/docs/proofs">prove one fact</Link> from its envelope.
        </p>

        <h2>Secrets never touch the chain in the clear</h2>
        <p>
          Anything secret a party sends (a trade&rsquo;s buyer, size and price; the DQ list; the
          opening positions) is sealed to the enclave&rsquo;s public key before it goes into a
          transaction. Lender payments are credits inside the books, not token transfers, so no
          per-lender amount ever appears on chain.
        </p>

        <h2>An answer that comes late counts for nothing</h2>
        <p>
          NEAR lets a contract wait about two minutes for the enclave. If no answer comes, the
          contract records &ldquo;the enclave did not answer; nothing changed&rdquo;, releases the
          lock and gives back any tokens sent with the action.
        </p>
        <p>
          The contract numbers every request and names the fingerprint it holds. The enclave builds
          only on the books with that fingerprint, and refuses a request with an older number than
          one it has already answered. So an enclave run that finishes after the wait changes
          nothing, and the action can simply be sent again. The scripts do that by themselves, up to
          four times; the app says what happened and asks you to press the button again.
        </p>

        <h2>Why this needs NEAR</h2>
        <ul>
          <li>
            <strong>
              A contract can call an enclave and get the answer back in the same transaction.
            </strong>{" "}
            OutLayer runs WASM inside Intel TDX with encrypted storage that persists between runs,
            and a NEAR contract calls it and resumes with the result (yield/resume). That is what
            lets the rules sit on chain while the books stay private. The contract, not a server,
            decides when the books run.
          </li>
          <li>
            <strong>Keys that nobody holds.</strong> The key that encrypts the books and the
            enclave&rsquo;s own X25519 key are derived by OutLayer&rsquo;s keystore for this project{" "}
            <em>and</em> the contract that called it. The program never sees the storage key, the
            developer has neither, and a run started by anyone but the rules contract gets a
            different key.
          </li>
          <li>
            <strong>Named accounts for every role.</strong> The contract&rsquo;s role checks and
            the enclave&rsquo;s views are keyed by names a person can read.
          </li>
          <li>
            <strong>One token transfer that also runs the books.</strong> The borrower pays with{" "}
            <code>ft_transfer_call</code> (NEP-141); the contract records the public amount and the
            enclave credits the books in the same transaction. If the books refuse, the tokens go
            back.
          </li>
          <li>
            <strong>An agent that is two of three, with no change to the contract.</strong> A NEAR
            account can be a Sputnik DAO. Name the DAO as the deal&rsquo;s agent and every agent
            action becomes a proposal that two of three operators must approve. See{" "}
            <Link href="/docs/governance">The agent, two of three</Link>.
          </li>
        </ul>
        <p>
          Next on NEAR: withdrawals through NEAR&rsquo;s confidential intents, so that even those
          amounts are hidden.
        </p>
      </div>

      <DocsPager current="/docs/lifecycle" />
    </article>
  );
}
