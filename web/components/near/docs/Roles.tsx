// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import { DocsHeader, DocsPager } from "@/components/DocsBlocks";
import { accountOf, accountUrl, NEAR } from "@/lib/near/config";

function Account({ id }: { id: string }) {
  return (
    <a href={accountUrl(accountOf(id))}>
      <code>{id}</code>
    </a>
  );
}

export function Roles() {
  return (
    <article>
      <DocsHeader
        kicker="Concepts"
        title="Parties and roles"
        summary="Eight named accounts take part in the demo deal. Each one signs its own actions and opens only its own envelope."
      />

      <div className="docs-prose mt-8">
        <div className="docs-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Party</th>
                <th>Account</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Agent</td>
                <td>
                  <Account id="agent" />
                </td>
                <td>
                  Fixes the rate, requests interest, settles each payment and settles each trade.
                  Sees the whole register, and never the DQ list itself.
                </td>
              </tr>
              <tr>
                <td>Borrower</td>
                <td>
                  <Account id="northwind" />
                </td>
                <td>
                  Pays each interest request with one token transfer, and keeps the DQ list. Sees
                  the register and every trade, and never a trade price.
                </td>
              </tr>
              <tr>
                <td>Lenders</td>
                <td>
                  <Account id="alder" />, <Account id="birch" />, <Account id="cedar" />
                </td>
                <td>
                  Fund the loan: 50,000,000.00, 30,000,000.00 and 20,000,000.00 of a 100,000,000.00
                  facility. Each sees its own position, payments, cash and trades.
                </td>
              </tr>
              <tr>
                <td>Buyers</td>
                <td>
                  <Account id="delta" />, <Account id="rival" />
                </td>
                <td>
                  Buy into the loan from a lender. In the demo the borrower puts Rival on the DQ
                  list, and Rival is told &ldquo;not settled&rdquo; and no reason.
                </td>
              </tr>
              <tr>
                <td>Auditor</td>
                <td>
                  <Account id="auditor" />
                </td>
                <td>
                  Follows the register through every payment and trade, with figures it can
                  recompute. Never sees a trade price or the DQ list.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Each account sits under <code>{NEAR.root}</code>. <Link href="/docs/privacy">Who sees what</Link>{" "}
          has the full table of what each reader sees, and what the public chain sees.
        </p>

        <h2>Named accounts for every role</h2>
        <p>
          The agent is <code>{accountOf("agent")}</code>, a lender is{" "}
          <code>{accountOf("alder")}</code>. The contract&rsquo;s role checks and the enclave&rsquo;s
          views are keyed by names a person can read.
        </p>

        <h2>The agent administers, and cannot overpay</h2>
        <p>
          The agent types the total it means to request. The enclave works the total out from the
          register, and if the two differ it refuses and says so. The contract never lets lenders be
          credited more than the borrower paid in for that request, and never pays out more test
          USDC than it holds for the deal. See{" "}
          <Link href="/docs/settlement">Payments and the two guards</Link>.
        </p>
        <p>
          A real agent desk does not act on one person&rsquo;s word, and on a chain it should not
          act on one key. On NEAR an account can be a contract, so the deal&rsquo;s agent can be a
          Sputnik DAO with three operators, of whom two must approve. See{" "}
          <Link href="/docs/governance">The agent, two of three</Link>.
        </p>

        <h2>A party acts for itself</h2>
        <p>
          The contract vouches for who called, and the enclave decides whether the caller is
          entitled. Only the holder can offer its position, only the named buyer can accept, and
          only the agent can settle the trade. A withdrawal always pays the caller from the
          caller&rsquo;s own balance. The <Link href="/docs/authority">authority matrix</Link> lists
          every call and the test that holds it.
        </p>

        <h2>The contract&rsquo;s owner</h2>
        <p>
          The owner (<code>{NEAR.root}</code>) loads the deal once, and can release the lock if a
          callback is lost. It cannot read the books, move money, act as the agent or set the
          fingerprint: only the enclave&rsquo;s answer to the contract&rsquo;s own request does
          that.
        </p>

        <h2>An account outside the deal</h2>
        <p>
          A buyer has to register a view key before it holds anything, so the contract lets any
          account register one, offer or accept a trade, pay test USDC in, or ask for a withdrawal.
          An account outside the deal can&rsquo;t read the books or move anyone&rsquo;s money: its
          offers and acceptances are refused, a withdrawal pays out only test USDC it paid in
          itself, and its envelope holds the deal&rsquo;s public terms and nothing of anyone
          else&rsquo;s. It can slow the deal down. A production deal would have the agent admit an
          account before it can call; that is not built.
        </p>

        <h2>Your own seat</h2>
        <p>
          On <Link href="/you">/you</Link> a visitor takes a seat with an account only they
          control: a NEAR testnet account named by a key. The visitor&rsquo;s browser holds the
          signing key and the view key, and the demo server never holds either. The visitor buys
          250,000.00 of the loan from Alder, and opens the envelope in the browser with a view key
          that never leaves it.
        </p>
      </div>

      <DocsPager current="/docs/roles" />
    </article>
  );
}
