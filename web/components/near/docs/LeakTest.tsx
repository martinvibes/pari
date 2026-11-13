// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import { DocsHeader, DocsPager } from "@/components/DocsBlocks";
import { repoUrl } from "@/components/near/docs/shared";

// The README's copy of the run, line for line.
const OUTPUT = `$ npm run prove:privacy

Leak test: deal northwind-14 on ledger.paridesk.testnet

Reading what anyone can read
  36 transactions: arguments, logs, receipts, return values  2,150,931 bytes
  the contract's whole storage: 51 keys                      65,450 bytes
  left out: the network's own gas and fee figures            1358 fields

Secrets searched for, in every way they could be written
  Alder's position: 50,000,000.00                            not found
  Birch's position: 30,000,000.00                            not found
  Cedar's position: 20,000,000.00                            not found
  Alder's interest payment: 985,833.33                       not found
  Birch's interest payment: 591,500.00                       not found
  Cedar's interest payment: 394,333.33                       not found
  the size of the trade: 10,000,000.00                       not found
  Alder's position after the trade: 40,000,000.00            not found
  the cash Delta paid Alder: 9,950,000.00                    not found
  the trade price: 99.5                                      not found
  the interest Alder kept on the trade date: 325,000.00      not found
  Alder's cash after its withdrawal: 485,833.33              not found
  Alder's cash after the trade: 10,435,833.33                not found
  Delta's cash after the trade: 2,050,000.00                 not found
  Alder's second-period interest: 845,000.00                 not found
  Birch's second-period interest: 585,000.00                 not found
  Cedar's second-period interest: 390,000.00                 not found
  Delta's second-period interest: 130,000.00                 not found
  the half of it Alder was paid: 422,500.00                  not found
  the half of it Birch was paid: 292,500.00                  not found
  the half of it Cedar was paid: 195,000.00                  not found
  the half of it Delta was paid: 65,000.00                   not found
  Alder's third-period payment: 1,219,833.33                 not found
  Birch's third-period payment: 890,500.00                   not found
  Cedar's third-period payment: 593,666.66                   not found
  Delta's third-period payment: 264,333.33                   not found
  Alder's cash at the end: 12,078,166.66                     not found
  Delta's cash at the end: 2,379,333.33                      not found
  the DQ list and screening results, by name                 not found
  Rival in the DQ transaction, beyond its envelope slot      not found (Rival 2, Delta 2)

Public by design: the same search does find these
  the interest request's total: 1,971,666.66                 found 39 times
  the short payment: 975,000.00                              found 24 times
  each buyer's deposit: 12,000,000.00                        found 28 times
  Alder's withdrawal: 500,000.00                             found 16 times
  who takes part (accounts)                                  found 544 times

Control skipped: the parties' view keys are not on this machine (they never leave the demo server).

The enclave
  program on OutLayer                                        paridesk.testnet/pari-core
  the one build this deal's contract would run (sha256)      edef73c7a53ee924982553f96886efab8bc2cb1d000d51e74f9026118d0c705d
  runs with an Intel TDX attestation from OutLayer           34 of 36 transactions
  of those, runs of any other build or program               none
  example                                                    https://testnet-api.outlayer.ai/attestations/by-tx/3CG5ocEEnJTbp2c8FyNKA7YLHC5uefow85y9vQgSVzSz
    TDX quote                                                5006 bytes, worker measurement 528235764e42c8ec…
    transaction                                              https://testnet.nearblocks.io/txns/3CG5ocEEnJTbp2c8FyNKA7YLHC5uefow85y9vQgSVzSz

PASS: 0 secrets in 2,216,417 bytes of public data.`;

export function LeakTest() {
  return (
    <article>
      <DocsHeader
        kicker="Design"
        title="The leak test"
        summary="One command downloads every transaction of a recorded run of the deal, plus the contract's whole storage, straight from NEAR testnet, and searches them for the deal's secrets. It needs no keys."
      />

      <div className="docs-prose mt-8">
        <h2>Run it</h2>
        <pre>
          <code>{`git clone https://github.com/martinvibes/pari && cd pari
cd near/scripts && npm install
npm run prove:privacy               # reads NEAR testnet; needs no key`}</code>
        </pre>
        <p>
          It searches for each lender&rsquo;s position, each payment, the trade&rsquo;s size and
          price, and the DQ list. It ends with{" "}
          <code>PASS: 0 secrets in … bytes of public data.</code> The source is{" "}
          <a href={repoUrl("near/scripts/src/prove-privacy.ts")}>near/scripts/src/prove-privacy.ts</a>.
        </p>

        <h2>Its output</h2>
        <p>
          From a fresh clone, on the recorded run of deal <code>northwind-14</code>. Lines that say
          the RPC is rate limiting and the script is trying again are left out. The storage figures
          change with the live deal.
        </p>
        <pre>{OUTPUT}</pre>

        <h2>How to read it</h2>
        <ul>
          <li>
            <strong>Reading what anyone can read.</strong> Every transaction of the run (arguments,
            logs, receipts, return values) and the contract&rsquo;s whole storage, fetched from
            public NEAR nodes. Base64 is decoded before searching.
          </li>
          <li>
            <strong>Secrets searched for.</strong> Each figure is searched for as a whole number in
            every way it could be written (cents, dollars with and without commas, token base
            units). The network&rsquo;s own gas and fee fields are left out, because on testnet the
            gas price happens to equal one of the deal&rsquo;s figures.
          </li>
          <li>
            <strong>Public by design.</strong> The same search does find the things Pari publishes
            on purpose, which shows the search works.
          </li>
          <li>
            <strong>Control.</strong> On a machine that holds the parties&rsquo; keys, and while the
            recorded deal is still the live one, the test opens the envelopes and finds every secret
            inside them. So the secrets are in the data; they are just sealed. On the
            builder&rsquo;s machine it found 24 of 24; five more figures are from earlier in the
            deal and no longer in the books (Alder&rsquo;s opening position, for one). Without the
            keys, or once the contract has moved on to a later deal, this part prints{" "}
            <code>Control skipped</code>, and the rest runs the same.
          </li>
          <li>
            <strong>The enclave.</strong> A deal pins one build of the enclave program by its
            sha256, named in the public arguments of the transaction that starts the deal. The test
            reads it from there. Each run of the enclave comes with an Intel TDX attestation from
            OutLayer, which you can fetch by transaction hash, and the test fails if any of them
            names another build or program. The two transactions of this run that never reach the
            enclave are the contract&rsquo;s own setup calls.
          </li>
        </ul>

        <h2>The run with a DAO as the agent</h2>
        <p>
          <code>npm run prove:privacy -- northwind-13</code> runs the leak test on the other
          recorded run, played with a Sputnik DAO as the agent. There the enclave runs in 34 of 62
          transactions: the rest are the DAO&rsquo;s proposals and its first approvals. A
          proposal&rsquo;s arguments are public, as everything in a DAO is: the rate, the total, the
          number of a request or a trade. None of them is a secret, and the leak test passes on the
          DAO run as well. See <Link href="/docs/governance">The agent, two of three</Link>.
        </p>
      </div>

      <DocsPager current="/docs/leak-test" />
    </article>
  );
}
