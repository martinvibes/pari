// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import { Callout, DocsHeader, DocsPager } from "@/components/DocsBlocks";
import { HOSTED_DEMO } from "@/components/near/docs/shared";

export function CheckIt() {
  return (
    <article>
      <DocsHeader
        kicker="Overview"
        title="Check it yourself"
        summary="Three ways, cheapest first: with no account and no keys, in the browser, and on your own deployment on NEAR testnet."
      />

      <div className="docs-prose mt-8">
        <h2>1. With no account and no keys</h2>
        <p>
          About five minutes. You need <a href="https://rustup.rs">Rust</a> and Node.js 22.
        </p>
        <pre>
          <code>{`git clone https://github.com/martinvibes/pari && cd pari

(cd near/enclave && cargo test)     # the deal's rules, with the deal's numbers
(cd near/contract && cargo test)    # roles, the lock, the money caps

cd near/scripts && npm install
npm run prove:privacy               # reads NEAR testnet; needs no key
npm run verify:proof                # checks one fact from a sealed view; needs no key`}</code>
        </pre>
        <p>You should see:</p>
        <ul>
          <li>
            <code>cargo test</code> in <code>near/enclave</code>: 28 tests pass (five files: 3, 5,
            4, 11 and 5).
          </li>
          <li>
            <code>cargo test</code> in <code>near/contract</code>: <code>26 passed</code>.
          </li>
          <li>
            <code>npm run prove:privacy</code> ends with{" "}
            <code>PASS: 0 secrets in … bytes of public data.</code> Its full output is under{" "}
            <Link href="/docs/leak-test">The leak test</Link>.
          </li>
          <li>
            <code>npm run verify:proof</code> ends with{" "}
            <code>
              PASS: the fact is what the enclave put in this party&rsquo;s view, and the proof shows
              no other.
            </code>{" "}
            Its full output is under <Link href="/docs/proofs">Prove one fact</Link>.
          </li>
        </ul>
        <p>
          The scripts and the app read NEAR through a free public RPC. When it answers{" "}
          <code>Rate limits exceeded</code> they wait and try again, so a step can pause, for up to
          four minutes after a long run of reads. To use another RPC, set{" "}
          <code>NEAR_RPC_URL</code> (and <code>NEAR_ARCHIVAL_RPC_URL</code>, which the leak test
          reads old transactions from).
        </p>
        <p>You can also read the live deal as the public does, in the app, with no keys:</p>
        <pre>
          <code>{`cd web && npm install
PARI_BACKEND=near npm run dev       # then open http://localhost:3000/visibility`}</code>
        </pre>
        <p>
          You should see the page titled <strong>Who sees what</strong> with a panel{" "}
          <strong>You are reading as the public</strong>: the contract&rsquo;s facts, one total per
          interest request, the record of every action, and eight sealed envelopes that this server
          cannot open, each beside its commitment.
        </p>

        <h2>2. Play the deal in the browser</h2>
        <p>
          This needs the demo&rsquo;s keys. The <a href={HOSTED_DEMO}>hosted demo</a> holds them and
          plays the builder&rsquo;s live deal on NEAR testnet; it is wherever the last visitor left
          it, so its numbers differ from the ones below. For the exact walk, use your own
          deployment. Each action usually takes 10 to 30 seconds on testnet, because the contract
          waits for the enclave. When OutLayer&rsquo;s testnet workers are busy it can take a minute
          or more.
        </p>
        <p>
          The numbers below are for a fresh deal. Every screen is one party&rsquo;s own view: pick
          the party&rsquo;s seat from the place cards down the left side (along the top in a window
          under 1440 pixels wide), or press its number key (1 to 8; 9 opens Who sees what, 0 your
          own seat).
        </p>

        <h3>Interest, and the Revlon mistake</h3>
        <ol>
          <li>
            Open <Link href="/agent">/agent</Link>. Under <strong>Next interest period</strong>,
            press <strong>Fix rate</strong>. You see:{" "}
            <em>Base rate fixed at 4.30% to 15 Dec 2026. All-in 7.80%.</em>
          </li>
          <li>
            Under <strong>Request interest</strong>, replace the total with{" "}
            <code>900,000,000.00</code> and press <strong>Request interest</strong>. You see:{" "}
            <strong>Refused</strong>.{" "}
            <em>
              You entered 900,000,000.00; the register says 1,971,666.66. Nothing changed: the books
              and the money are as they were.
            </em>
          </li>
          <li>
            Type <code>1,971,666.66</code> (a reload prefills it) and press{" "}
            <strong>Request interest</strong>. You see:{" "}
            <em>
              Interest requested: 1,971,666.66. The chain shows the total; each lender&rsquo;s share
              stays sealed.
            </em>
          </li>
          <li>
            Open <Link href="/borrower">/borrower</Link> and press <strong>Pay</strong>. You see:{" "}
            <em>Paid 1,971,666.66 of test USDC into the deal.</em>
          </li>
          <li>
            Back on <code>/agent</code>, press <strong>Settle all 3 lenders</strong>. You see:{" "}
            <em>
              Settled. Every lender was credited in one step. The chain shows one total,
              1,971,666.66, and no lender&rsquo;s share.
            </em>
          </li>
          <li>
            Open <Link href="/lender/alder">/lender/alder</Link>. You see Alder was paid{" "}
            <strong>985,833.33</strong>, and nothing about Birch or Cedar.{" "}
            <code>/lender/birch</code> shows <strong>591,500.00</strong> and{" "}
            <code>/lender/cedar</code> shows <strong>394,333.33</strong>. <code>/auditor</code>{" "}
            shows all three.
          </li>
          <li>
            Open <Link href="/visibility">/visibility</Link>. The <strong>Public chain</strong>{" "}
            column has one payment total and no register line, payment leg, trade price or DQ list.
            Under <strong>The public chain</strong> you see the total 1,971,666.66, the books&rsquo;
            fingerprint, eight sealed envelopes, and the refusal from step 2 on the public record.
            Under <strong>Checked live</strong>, eight claims read <strong>Holds</strong>.
          </li>
        </ol>

        <h3>A trade, screened against a list the buyer never sees</h3>
        <ol start={8}>
          <li>
            On <code>/agent</code>, press <strong>Fix rate</strong> again (the next period, to 15
            Mar 2027).
          </li>
          <li>
            On <code>/borrower</code>, under the DQ list, tick <strong>Rival</strong> and press{" "}
            <strong>Save DQ list</strong>. You see:{" "}
            <em>
              DQ list updated. It went to the enclave sealed: the chain carries only ciphertext.
            </em>
          </li>
          <li>
            On <code>/lender/rival</code> press <strong>Pay in</strong>, then the same on{" "}
            <code>/lender/delta</code> (12,000,000.00 of test USDC each).
          </li>
          <li>
            On <code>/lender/alder</code>, under <strong>Sell part of your position</strong>, choose{" "}
            <strong>Rival</strong> and press <strong>Offer trade</strong>. On{" "}
            <code>/lender/rival</code> press <strong>Accept</strong>. On <code>/agent</code> press{" "}
            <strong>Settle</strong>. You see:{" "}
            <em>Not settled. Nothing moved, and the buyer is told nothing more.</em> Rival&rsquo;s
            screen says <em>not settled</em> and gives no reason. The agent&rsquo;s screen says{" "}
            <em>The buyer is on the DQ list.</em>
          </li>
          <li>
            Do the same with <strong>Delta</strong> as the buyer. You see:{" "}
            <em>Trade settled. Cash, register and both positions moved in one step.</em> Delta holds
            10,000,000.00 and paid 9,950,000.00. Alder holds 40,000,000.00 with 845,000.00 of
            interest due at period end: 780,000.00 on what it kept, plus the 65,000.00 it earned on
            the part it sold, up to the trade date. <code>/borrower</code> shows the trade and no
            price.
          </li>
        </ol>

        <h3>A short payment, and the period that pays the rest</h3>
        <ol start={13}>
          <li>
            On <code>/agent</code>, press <strong>Request interest</strong>. The form is prefilled
            with <code>1,950,000.00</code>, the second period&rsquo;s interest for the four lenders.
          </li>
          <li>
            On <code>/borrower</code>, replace the amount with <code>975,000.00</code> and press{" "}
            <strong>Pay</strong>. You see: <em>Paid 975,000.00 of test USDC into the deal.</em>
          </li>
          <li>
            On <code>/agent</code>, press <strong>Settle the short payment pro rata</strong>. Every
            lender was paid the same half of what it was owed. <code>/lender/alder</code> shows
            422,500.00 paid of 845,000.00 due, and the other half still owed. Birch got 292,500.00,
            Cedar 195,000.00 and Delta 65,000.00, each on its own screen only.
          </li>
          <li>
            On <code>/agent</code>, press <strong>Fix rate</strong> (the third period, to 15 Jun
            2027). The request form now reads <code>2,968,333.32</code>: the third period&rsquo;s
            interest plus every unpaid half. Press <strong>Request interest</strong>, then{" "}
            <strong>Pay</strong> on <code>/borrower</code>, then{" "}
            <strong>Settle all 4 lenders</strong> on <code>/agent</code>.{" "}
            <code>/lender/alder</code> shows <strong>1,219,833.33</strong> paid, and nothing left
            owed from the short period.
          </li>
        </ol>

        <h3>With an account only you control</h3>
        <ol start={17}>
          <li>
            Open <Link href="/you">/you</Link> (the <strong>You</strong> seat, last of the place
            cards, or press 0). Sign in with Privy, or press{" "}
            <strong>Use a key made in this browser</strong>. You see: a NEAR testnet account named
            by a key. The demo server never holds that key.
          </li>
          <li>
            Press the six buttons in order: <strong>Get test funds</strong>,{" "}
            <strong>Register view key</strong>, <strong>Pay in</strong>,{" "}
            <strong>Ask Alder for an offer</strong>, <strong>Accept</strong>,{" "}
            <strong>Ask the agent to settle</strong>. Each step says whose account signs it. The
            faucet, Alder and the agent sign on the demo server. Your three are signed in your
            browser and sent to NEAR from there. You see:{" "}
            <em>Trade settled. Your cash went to Alder and the loan came to you in one step.</em>{" "}
            You hold 250,000.00 of the loan, bought at 99.50 for 248,750.00, with 1,250.00 of cash
            left in the books.
          </li>
        </ol>

        <h2>3. Your own deployment on testnet</h2>
        <p>
          About ten minutes. You need Rust, <a href="https://github.com/near/cargo-near">cargo-near</a>
          , the <a href="https://github.com/near/near-cli-rs">near CLI</a>, Node.js 22, and a testnet
          account holding about 18 NEAR whose key is in <code>~/.near-credentials/testnet/</code>.
        </p>
        <pre>
          <code>{`# a new testnet account, funded by the faucet, with its key saved where the scripts look
near account create-account sponsor-by-faucet-service YOU.testnet \\
  autogenerate-new-keypair save-to-legacy-keychain network-config testnet create

export PARI_ROOT=YOU.testnet
cd near && ./build.sh                 # the contract, the test USDC and the enclave program
cd scripts && npm install
npm run setup                         # accounts, contracts, the enclave build, the sealed deal
npm run e2e                           # plays the whole deal and checks every figure
npm run prove:privacy                 # the leak test, on the run you just made
cd ../../web && npm install
PARI_BACKEND=near npm run dev         # http://localhost:3000/agent`}</code>
        </pre>
        <p>
          <code>npm run setup</code> is safe to run again: every step checks the chain first and
          does only what is missing. <code>npm run setup -- --fresh</code> starts a new deal with
          new books. The faucet starts a new account with 10 NEAR, so top it up before running
          setup.
        </p>
        <p>
          <code>npm run e2e</code> ends with <code>All green.</code> and the books&rsquo;
          fingerprint. It plays the interest payment (with the mistyped total refused), a
          withdrawal, the DQ list, Rival&rsquo;s refused trade and Delta&rsquo;s settled one,
          Birch&rsquo;s attempt to reuse Alder&rsquo;s sealed offer, then a short payment and the
          period that pays the rest, and checks each party&rsquo;s envelope after every step.
        </p>
      </div>

      <div className="mt-8 space-y-4">
        <Callout label="Demo mode">
          The demo server holds a testnet key for every party, so one browser can play the whole
          deal. Each action is still signed by the one account entitled to it, and each screen opens
          only its own party&rsquo;s envelope. The one exception is <code>/you</code>: there the
          visitor&rsquo;s browser holds the signing key and the view key, and the server plays only
          the other side.
        </Callout>
        <Callout label="If the enclave is slow" signal>
          If the enclave misses NEAR&rsquo;s two-minute wait, the app says{" "}
          <em>
            The enclave did not answer within NEAR&rsquo;s two-minute wait. Press it again: an
            answer that comes late counts for nothing.
          </em>{" "}
          Nothing has changed when you see that, so press the button again. See{" "}
          <Link href="/docs/lifecycle">How an action runs</Link>.
        </Callout>
      </div>

      <DocsPager current="/docs/quickstart" />
    </article>
  );
}
