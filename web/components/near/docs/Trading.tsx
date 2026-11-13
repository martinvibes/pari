// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import { DocsHeader, DocsPager } from "@/components/DocsBlocks";
import { TestName } from "@/components/near/docs/shared";

const TESTS = [
  { rule: "A trade settles cash against loan", test: "trading: test_trade_settles_delivery_versus_payment" },
  { rule: "Interest is split on the trade date", test: "trading: test_interest_is_split_on_the_trade_date" },
  { rule: "A lender that sells everything keeps the interest it earned", test: "trading: test_full_exit_keeps_earned_interest" },
  { rule: "A buyer on the DQ list is refused", test: "trading: test_dq_listed_buyer_is_refused" },
  { rule: "The borrower and the auditor see the trade but never the price", test: "trading: test_trade_privacy" },
  { rule: "A sealed offer copied from the chain is no use to anyone else", test: "protocol: test_a_sealed_offer_copied_from_the_chain_is_no_use_to_anyone_else" },
];

export function Trading() {
  return (
    <article>
      <DocsHeader
        kicker="Design"
        title="Trading and screening"
        summary="A trade settles cash against loan in one step, or not at all. The buyer is screened against the borrower's DQ list, and never sees the list."
      />

      <div className="docs-prose mt-8">
        <h2>Three actions</h2>
        <ol>
          <li>
            <strong>The seller offers.</strong> The buyer, the size, the price and the trade date go
            to the enclave sealed. Only the holder can offer its position.
          </li>
          <li>
            <strong>The buyer accepts.</strong> Only the named buyer can accept. A buyer pays test
            USDC into the deal first: 12,000,000.00 each for Delta and Rival in the demo.
          </li>
          <li>
            <strong>The agent settles.</strong> Only the agent can settle the trade.
          </li>
        </ol>

        <h2>Cash against loan, in one step</h2>
        <p>
          In the demo Alder sells 10,000,000.00 of its position to Delta at 99.50. When the agent
          settles, cash, register and both positions move in one step. Delta holds 10,000,000.00 and
          paid 9,950,000.00.
        </p>
        <p>
          Interest is split on the trade date. Alder holds 40,000,000.00 with 845,000.00 of interest
          due at period end: 780,000.00 on what it kept, plus the 65,000.00 it earned on the part it
          sold, up to the trade date.
        </p>
        <p>The borrower&rsquo;s screen shows the trade and no price.</p>

        <h2>A list the buyer never sees</h2>
        <p>
          The borrower keeps the DQ list: the buyers who may not buy into the loan. It goes to the
          enclave sealed, so the chain carries only ciphertext.
        </p>
        <p>
          In the demo the borrower ticks Rival. Alder offers a trade to Rival, Rival accepts, and
          the agent presses Settle. The answer is{" "}
          <em>Not settled. Nothing moved, and the buyer is told nothing more.</em> Rival&rsquo;s
          screen says <em>not settled</em> and gives no reason. The agent&rsquo;s screen says{" "}
          <em>The buyer is on the DQ list.</em> The agent sees whether a buyer passed screening, and
          never the DQ list itself.
        </p>

        <h2>A sealed box is no use to anyone but its sender</h2>
        <p>
          The ciphertext sits on the public chain, where anyone can copy it. If the enclave took it
          from any caller, Birch could send Alder&rsquo;s sealed offer as its own and read the
          buyer, the size and the price in its own envelope. So the sealed fields name the deal, the
          caller and the command they are for, and the enclave refuses a box that arrives any other
          way. <code>npm run e2e</code> plays exactly that on testnet: Birch sends Alder&rsquo;s box
          and is refused.
        </p>

        <h2>What the chain shows of a trade</h2>
        <p>
          Every action is a transaction signed by a named account. The chain shows that Alder
          offered a trade, that Delta accepted it and whether it settled. It does not show the size,
          the price or why a trade failed. A buyer&rsquo;s deposit is a token transfer, so its
          amount is public; what the money is for is not. See{" "}
          <Link href="/docs/privacy">Who sees what</Link>.
        </p>

        <h2>Tested</h2>
        <div className="docs-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Rule</th>
                <th>Test</th>
              </tr>
            </thead>
            <tbody>
              {TESTS.map((row) => (
                <tr key={row.test}>
                  <td>{row.rule}</td>
                  <td>
                    <TestName id={row.test} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DocsPager current="/docs/trading" />
    </article>
  );
}
