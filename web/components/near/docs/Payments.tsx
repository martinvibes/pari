// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import { DocsHeader, DocsPager } from "@/components/DocsBlocks";
import { TestName } from "@/components/near/docs/shared";

// The tests behind this page, by file under near/enclave/tests and in
// near/contract/src/tests.rs.
const TESTS = [
  { rule: "Every lender is paid in one step, to the cent", test: "interest: test_interest_paid_to_every_lender_in_one_step" },
  { rule: "A short payment is shared pro rata", test: "interest: test_short_payment_is_shared_pro_rata" },
  { rule: "The borrower cannot favour a lender", test: "interest: test_borrower_cannot_favour_a_lender" },
  { rule: "Every lender is paid, or none is", test: "interest: test_every_lender_is_paid_or_none_is" },
  { rule: "The agent cannot request more than the register says", test: "principal: test_agent_cannot_request_more_than_the_register_says" },
  { rule: "A settlement cannot pay more than was requested", test: "principal: test_settlement_cannot_pay_more_than_requested" },
  { rule: "No settlement without an open request", test: "principal: test_no_settlement_without_an_open_request" },
  { rule: "A withdrawal is capped by the party's cash", test: "principal: test_withdrawal_is_capped_by_the_party_s_cash" },
  { rule: "Lenders cannot be credited more than the borrower paid in", test: "contract: test_lenders_cannot_be_credited_more_than_the_borrower_paid_in" },
  { rule: "A payout cannot exceed the USDC held", test: "contract: test_a_payout_cannot_exceed_the_usdc_held" },
];

export function Payments() {
  return (
    <article>
      <DocsHeader
        kicker="Design"
        title="Payments and the two guards"
        summary="Every lender is paid in one step, to the cent. Two guards stand between a typo and the money: the enclave enforces the deal, and the contract enforces the money."
      />

      <div className="docs-prose mt-8">
        <h2>An interest payment</h2>
        <ol>
          <li>
            <strong>The agent fixes the rate.</strong> In the demo deal: base rate 4.30% to 15 Dec
            2026, all-in 7.80%.
          </li>
          <li>
            <strong>The agent types the total it means to request.</strong> For the first period
            that is 1,971,666.66. The chain shows the total; each lender&rsquo;s share stays sealed.
          </li>
          <li>
            <strong>The borrower pays once.</strong> One transfer of test USDC into the deal.
          </li>
          <li>
            <strong>One settlement pays every lender.</strong> Alder is credited 985,833.33, Birch
            591,500.00 and Cedar 394,333.33 inside the books. The chain shows one total,
            1,971,666.66, and no lender&rsquo;s share.
          </li>
        </ol>

        <h2>Two guards stand between a typo and the money</h2>
        <ol>
          <li>
            <strong>The enclave enforces the deal.</strong> The agent types the total it means to
            request. The enclave works the total out from the register, and if the two differ it
            refuses and says so: &ldquo;You entered 900,000,000.00; the register says
            1,971,666.66.&rdquo;
          </li>
          <li>
            <strong>The contract enforces the money.</strong> It never lets lenders be credited more
            than the borrower paid in for that request, and never pays out more test USDC than it
            holds for the deal. It checks this itself on every answer. If an answer ever broke a
            money rule, the contract would freeze the deal instead of paying.
          </li>
        </ol>
        <p>
          The refusal is on the public record, and the books do not move. Approval does not replace
          the rule either: when the agent is a DAO, two operators can approve a request for
          900,000,000.00 and the enclave still refuses it. See{" "}
          <Link href="/docs/governance">The agent, two of three</Link>.
        </p>

        <h2>One token transfer that also runs the books</h2>
        <p>
          The borrower pays with <code>ft_transfer_call</code> (NEP-141); the contract records the
          public amount and the enclave credits the books in the same transaction. If the books
          refuse, the tokens go back. Only the deal&rsquo;s test USDC is accepted, and only the
          borrower pays a request.
        </p>
        <p>
          Lender payments are credits inside the books, not token transfers, so no per-lender amount
          ever appears on chain. A lender takes its cash out with a withdrawal: Alder withdraws
          500,000.00, and the contract pays exactly that in test USDC. Deposits and withdrawals are
          token transfers, so their amounts are public; what the money is for, and what is left in
          the books, are not.
        </p>

        <h2>A short payment, and the period that pays the rest</h2>
        <p>
          A short payment is shared pro rata, and the unpaid part is paid with the next period. In
          the demo the borrower pays 975,000.00 of the 1,950,000.00 requested for the second period.
          One settlement pays every lender the same half of what it is owed: Alder 422,500.00 of
          845,000.00, Birch 292,500.00, Cedar 195,000.00 and Delta 65,000.00, each on its own screen
          only.
        </p>
        <p>
          The third period&rsquo;s request then reads 2,968,333.32: the third period&rsquo;s
          interest plus every unpaid half. After it settles, Alder shows 1,219,833.33 paid, and
          nothing left owed from the short period.
        </p>

        <h2>The arithmetic</h2>
        <p>
          Money is whole cents in integers everywhere. Interest is ACT/360, rounded down to the
          cent. A short payment pays each lender the same fraction of what it is owed, rounded down
          to the cent, and a cent lost to rounding goes back to the borrower, never to a lender. The
          expected figures (985,833.33, 591,500.00, 394,333.33, total 1,971,666.66, and 65,000.00
          kept by the seller) are the same ones the Canton tests use.
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

      <DocsPager current="/docs/settlement" />
    </article>
  );
}
