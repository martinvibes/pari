// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from "next";
import { Callout, DocsHeader, DocsPager } from "@/components/DocsBlocks";

export const metadata: Metadata = { title: "The agent, two of three" };

// Mirrors the table in docs/governance.md.
const GUARANTEES = [
  {
    claim: "A payment needs two of three operators: one confirmation moves nothing, a second pays every lender",
    test: "test_settlement_needs_two_of_three_operators; LocalNet demo",
  },
  {
    claim: "An operator alone is not the agent: it cannot exercise the agent's choices, propose in another operator's name or the agent's, or confirm twice",
    test: "test_an_operator_alone_is_not_the_agent",
  },
  {
    claim: "Only the operators propose and confirm; a lender cannot, even reading as the agent",
    test: "test_only_operators_propose_and_confirm",
  },
  {
    claim: "A confirmation counts for one proposal, for a limited time, once",
    test: "test_confirmations_are_bound_timed_and_single_use",
  },
  {
    claim: "A proposal acts only on the state the operators reviewed: once that changes, it cannot execute",
    test: "test_a_stale_proposal_cannot_execute",
  },
  {
    claim: "The whole deal runs governed, each step by a different pair, and every step is on the record",
    test: "test_operators_run_the_deal_two_of_three",
  },
  {
    claim: "Every other agent choice runs governed the same way",
    test: "test_every_other_agent_choice_runs_governed",
  },
  { claim: "No node can submit as the agent, not even the operators'", test: "LocalNet demo" },
  {
    claim: "With one operator's node offline, the other two settle a payment, and the offline node catches up",
    test: "LocalNet demo",
  },
];

export default function GovernancePage() {
  return (
    <article>
      <DocsHeader
        kicker="Design"
        title="The agent, two of three"
        summary="Three independent operators run the agent together. Any two must confirm before it acts, and no one of them, not even its own node, can act as the agent alone."
      />

      <div className="docs-prose mt-8">
        <h2>Why</h2>
        <p>
          A syndicated loan&rsquo;s administrative agent is one firm. If its keys leak, or a rogue
          employee uses them, the agent&rsquo;s party can do anything the agent can. If its systems
          go down, interest stops being paid. And when the agent resigns or fails, as Lehman
          Brothers did in 2008, handing the role to a successor is slow and manual.
        </p>
        <p>
          Pari can run the agent as a decentralized party instead, using BitSafe&rsquo;s{" "}
          <a href="https://github.com/DLC-link/decentralization-manager">
            Decentralization Manager
          </a>{" "}
          (DecMan) and its governance packages, unmodified.
        </p>

        <h2>The agent&rsquo;s party belongs to no single node</h2>
        <ul>
          <li>
            Its namespace is owned by the three nodes&rsquo; keys together, with a threshold of two,
            so no single operator can change who hosts the party or how.
          </li>
          <li>
            It is hosted on all three operators&rsquo; nodes with <em>confirmation</em> permission
            and a hosting threshold of two. No node has <em>submission</em> permission, so no node
            can submit a command as the agent.
          </li>
          <li>
            The operators are all agent-side: the agent&rsquo;s own operations desk, an independent
            co-agent such as a fund administrator, and the successor agent named in the credit
            agreement. Hosting the agent shows nothing new to lenders, the borrower or anyone else.
          </li>
        </ul>

        <h2>Every action is a proposal</h2>
        <p>
          <code>daml/pari-governance</code> defines <code>AgentAction</code>, one operator&rsquo;s
          proposal that the agent take one action. It implements BitSafe&rsquo;s{" "}
          <code>GovernableAction</code> interface and covers every action the agent takes. The
          agent&rsquo;s other choices are steps inside these, such as funding each commitment when
          the facility closes, so they too run only as part of a governed action.
        </p>
        <ol>
          <li>
            One operator proposes the action. The proposal names the exact contracts it acts on, so
            the operators confirm the state they reviewed.
          </li>
          <li>
            Operators confirm it on BitSafe&rsquo;s <code>GovernanceRules</code>, each through their
            own node and DecMan. A confirmation is bound to one proposal and expires.
          </li>
          <li>
            Once two have confirmed, either of them executes it. The rules, signed by the agent,
            pass on the agent&rsquo;s authority for that one action and leave a{" "}
            <code>GovernanceExecutionResult</code>: the action, who executed it, who confirmed it,
            and when.
          </li>
        </ol>
        <p>
          The model&rsquo;s guarantees are unchanged: the agent still cannot create, move or shrink
          a position, or hold money. Governance only decides who can make the agent act within
          those limits.
        </p>

        <h2>What is guaranteed, and how it is tested</h2>
        <div className="docs-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Guarantee</th>
                <th>Test</th>
              </tr>
            </thead>
            <tbody>
              {GUARANTEES.map((g) => (
                <tr key={g.claim}>
                  <td>{g.claim}</td>
                  <td>
                    <code>{g.test}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          The Daml tests are in <code>daml/pari-governance-tests</code> and run in{" "}
          <code>make test</code>. The LocalNet demo runs the deal on three real participant nodes,
          each with its own DecMan, and checks each claim against the ledger.
        </p>

        <h2>Run it</h2>
        <p>
          With Docker, <code>jq</code>, <code>grpcurl</code>, Node.js and dpm installed, build
          DecMan in test mode:
        </p>
        <pre>
          <code>{`git clone https://github.com/DLC-link/decentralization-manager
cd decentralization-manager
DECMAN_SKIP_FRONTEND=1 cargo build --profile release-ci --features test-mode -p decman
export DECMAN_BIN=$PWD/target/release-ci/dec-party-manager`}</code>
        </pre>
        <p>
          Then, from Pari&rsquo;s root, with <code>npm install</code> run once in <code>web/</code>:
        </p>
        <pre>
          <code>{`make localnet-up     # LocalNet, three DecMan nodes, the agent's party and its rules
make localnet-demo   # the deal, governed, with every check
make localnet-down   # stop it and delete its data`}</code>
        </pre>
        <p>
          The demo runs the whole deal governed, then settles an interest payment of 1,971,666.66
          with the first operator&rsquo;s node disconnected from the synchronizer. The other two
          confirm it, each lender is paid to the cent, and the offline node catches up once it
          reconnects.
        </p>
      </div>

      <div className="mt-8">
        <Callout label="Scope" signal>
          All three nodes and their DecMan instances run on one machine, and DecMan is built in test
          mode, without HTTP authentication. In production each operator runs its own node and
          DecMan. The web app and the deal on the HackCanton DevNet still run the agent as one
          party: the shared DevNet node gives each team one participant, and a decentralized party
          needs several.
        </Callout>
      </div>

      <DocsPager current="/docs/governance" />
    </article>
  );
}
