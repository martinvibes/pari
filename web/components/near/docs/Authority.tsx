// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";
import { DocsHeader, DocsPager } from "@/components/DocsBlocks";
import { TestName, repoUrl } from "@/components/near/docs/shared";

// The rules contract's calls, from near/contract/src/lib.rs.
const CALLS: { call: string; also?: string; note?: string; who: string; does: string; test: string }[] = [
  { call: "fix_rate", who: "the agent", does: "Fixes the period's base rate and its end date", test: "contract: test_only_the_agent_fixes_the_rate" },
  { call: "request_interest", who: "the agent", does: "Types the total it expects. The enclave refuses unless it equals what the register says", test: "contract: test_the_borrower_cannot_request_interest" },
  { call: "settle", who: "the agent", does: "Settles a payment: every lender is credited in one step", test: "contract: test_a_lender_cannot_settle_a_payment" },
  { call: "settle_trade", who: "the agent", does: "Settles a trade, cash against loan", test: "authority: test_only_the_right_party_can_run_each_command" },
  { call: "set_dq", who: "the borrower", does: "Sets the list of buyers who may not buy into the loan, sealed", test: "contract: test_the_agent_cannot_set_the_dq_list" },
  { call: "ft_transfer_call", note: "to pay a request", who: "the borrower", does: "Pays an open interest request in the deal's test USDC", test: "contract: test_only_the_borrower_pays_a_request" },
  { call: "ft_transfer_call", note: "as cash", who: "any account", does: "Holds the caller's own cash in the books, as a buyer does before it buys in", test: "contract: test_a_transfer_from_another_token_is_rejected" },
  { call: "register_view_key", who: "any account", does: "Registers the key the caller's envelopes are sealed to", test: "contract: test_a_view_key_is_published_once_the_enclave_accepts_it" },
  { call: "offer_trade", who: "the seller", does: "Offers part of its position: the buyer, size, price and trade date, sealed", test: "authority: test_only_the_right_party_can_run_each_command" },
  { call: "accept_trade", who: "the buyer", does: "Accepts an offer that names it as the buyer", test: "authority: test_only_the_right_party_can_run_each_command" },
  { call: "withdraw", who: "any party", does: "Takes its own cash out of the deal as test USDC", test: "authority: test_a_party_can_only_move_its_own_cash" },
  { call: "init_deal", also: "unlock", who: "the owner", does: "Loads the closed deal once; releases a lock left by a callback that never ran", test: "contract: test_only_the_owner_sets_the_deal_up" },
];

const NEVER = [
  { cannot: "The agent cannot request more than the register says", test: "principal: test_agent_cannot_request_more_than_the_register_says" },
  { cannot: "A settlement cannot pay more than was requested", test: "principal: test_settlement_cannot_pay_more_than_requested" },
  { cannot: "Nothing settles without an open request", test: "principal: test_no_settlement_without_an_open_request" },
  { cannot: "Lenders cannot be credited more than the borrower paid in", test: "contract: test_lenders_cannot_be_credited_more_than_the_borrower_paid_in" },
  { cannot: "A payout cannot exceed the test USDC the contract holds", test: "contract: test_a_payout_cannot_exceed_the_usdc_held" },
  { cannot: "A payout goes only to the party that asked", test: "contract: test_a_payout_goes_only_to_the_party_that_asked" },
  { cannot: "Only a withdrawal pays out", test: "contract: test_only_a_withdrawal_pays_out" },
  { cannot: "A withdrawal is capped by the party's cash", test: "principal: test_withdrawal_is_capped_by_the_party_s_cash" },
  { cannot: "Every lender is paid, or none is", test: "interest: test_every_lender_is_paid_or_none_is" },
  { cannot: "The borrower cannot favour a lender", test: "interest: test_borrower_cannot_favour_a_lender" },
  { cannot: "One action runs at a time", test: "contract: test_one_action_at_a_time" },
  { cannot: "Nothing runs once the deal is frozen", test: "contract: test_nothing_runs_once_frozen" },
  { cannot: "The deal is set up once", test: "authority: test_the_deal_is_set_up_once_and_the_root_tracks_every_change" },
  { cannot: "A sealed offer copied from the chain is no use to anyone else", test: "protocol: test_a_sealed_offer_copied_from_the_chain_is_no_use_to_anyone_else" },
  { cannot: "A late run cannot undo an answer the contract received", test: "protocol: test_a_late_run_cannot_undo_an_answer_the_contract_received" },
];

export function Authority() {
  return (
    <article>
      <DocsHeader
        kicker="Reference"
        title="Authority matrix"
        summary="Who may call what on the rules contract, and the test that holds each limit. The contract vouches for who called, and the enclave decides whether the caller is entitled."
      />

      <div className="docs-prose mt-8">
        <h2>Who may call what</h2>
        <div className="docs-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Call</th>
                <th>Who</th>
                <th>What it does, and its test</th>
              </tr>
            </thead>
            <tbody>
              {CALLS.map((row) => (
                <tr key={row.call + (row.note ?? "")}>
                  <td>
                    <code>{row.call}</code>
                    {row.also && (
                      <>
                        , <code>{row.also}</code>
                      </>
                    )}
                    {row.note && <>, {row.note}</>}
                  </td>
                  <td>{row.who}</td>
                  <td>
                    {row.does}
                    <br />
                    <TestName id={row.test} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          The agent&rsquo;s and the borrower&rsquo;s calls are checked by the contract itself. For
          the calls any account can send, the contract only vouches for who called, and the enclave
          decides whether the caller is entitled. When the agent is a DAO, each of the agent&rsquo;s
          calls is a proposal that two of three operators must approve; see{" "}
          <Link href="/docs/governance">The agent, two of three</Link>.
        </p>

        <h2>What nobody can do</h2>
        <div className="docs-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Limit</th>
                <th>Test</th>
              </tr>
            </thead>
            <tbody>
              {NEVER.map((row) => (
                <tr key={row.test}>
                  <td>{row.cannot}</td>
                  <td>
                    <TestName id={row.test} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>The contract&rsquo;s owner</h2>
        <p>
          The owner loads the deal once, and can release the lock if a callback is lost. It cannot
          read the books, move money, act as the agent or set the fingerprint: only the
          enclave&rsquo;s answer to the contract&rsquo;s own request does that.
        </p>

        <h2>The tests</h2>
        <pre>{`enclave   interest     5   one-step payment to the cent, pro rata, no favourites, all or none
          trading      5   cash against loan, interest split on the trade date, DQ screening, trade privacy
          principal    4   the Revlon guard: no request, settlement or withdrawal above what is due
          authority    3   only the right party runs each command
          protocol    11   one envelope per party, one-fact proofs, late answers, no guess confirmed, no box reused
contract              26   roles, one action at a time, credited ≤ paid in, payouts ≤ held, freeze
───────────────────────────────────────────────────────────────────────────────────────────────────
54 tests passing`}</pre>
        <p>
          The enclave&rsquo;s tests are in{" "}
          <a href={repoUrl("near/enclave/tests")}>near/enclave/tests</a> and the contract&rsquo;s in{" "}
          <a href={repoUrl("near/contract/src/tests.rs")}>near/contract/src/tests.rs</a>. The
          deal&rsquo;s rules are ported from the Canton build&rsquo;s Daml tests with the same names
          and numbers. Run them with <code>cargo test</code> in each folder; see{" "}
          <Link href="/docs/quickstart">Check it yourself</Link>.
        </p>
      </div>

      <DocsPager current="/docs/authority" />
    </article>
  );
}
