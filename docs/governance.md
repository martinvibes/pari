# The agent, run two of three

A syndicated loan's administrative agent is one firm. If its keys leak, or a
rogue employee uses them, the agent's party can do anything the agent can.
If its systems go down, interest stops being paid. And when the agent
resigns or fails, as Lehman Brothers did in 2008, handing the role to a
successor is slow and manual.

Pari can run the agent as a decentralized party instead: several operators,
each on its own Canton node, act as the agent together, and any two of three
must agree before it does anything. This uses BitSafe's
[Decentralization Manager](https://github.com/DLC-link/decentralization-manager)
(DecMan) and its governance packages, unmodified.

## How it works

**The agent's party belongs to no single node.** On LocalNet, `pari-agent` is
a decentralized party, set up through DecMan:

- Its namespace is owned by the three nodes' keys together, with a threshold
  of two, so no single operator can change who hosts the party or how.
- It is hosted on all three operators' nodes with *confirmation* permission,
  and a hosting threshold of two. No node has *submission* permission, so no
  node can submit a command as the agent.
- Each node sees what the agent sees. The operators are all agent-side (the
  agent's own operations desk, an independent co-agent such as a fund
  administrator, and the successor agent named in the credit agreement), so
  hosting the agent shows nothing new to lenders, the borrower or anyone else.

**Every action is a proposal.** `daml/pari-governance` defines `AgentAction`,
one operator's proposal that the agent take one action. It implements
BitSafe's `GovernableAction` interface, and covers every action the agent
takes: opening a desk, proposing a facility, inviting lenders, closing,
fixing the rate, requesting interest, accepting a prepayment, settling or
withdrawing a payment request, screening a buyer, settling or declining a
trade, and sharing a document. The agent's other choices are steps inside
these, such as funding each commitment when the facility closes, so they
too run only as part of a governed action.

1. One operator proposes the action. The proposal names the exact contracts
   it acts on, so the operators confirm the state they reviewed.
2. Operators confirm it on BitSafe's `GovernanceRules`, each through their own
   node and DecMan. A confirmation is bound to one proposal and expires (after
   30 minutes on LocalNet).
3. Once two have confirmed, either of them executes it. `GovernanceRules`,
   signed by the agent, passes on the agent's authority for that one action,
   and leaves a `GovernanceExecutionResult`: the action, who executed it, who
   confirmed it, and when.

The model's guarantees are unchanged: the agent still cannot create, move or
shrink a position, or hold money. Governance only decides who can make the
agent act within those limits.

## What is guaranteed, and how it is tested

| Guarantee | Test |
|---|---|
| A payment needs two of three operators: one confirmation moves nothing, a second pays every lender | `Governance: test_settlement_needs_two_of_three_operators`; LocalNet demo |
| An operator alone is not the agent: it cannot exercise the agent's choices, propose in another operator's name or the agent's, or confirm twice | `Governance: test_an_operator_alone_is_not_the_agent` |
| Only the operators propose and confirm; a lender cannot, even reading as the agent | `Governance: test_only_operators_propose_and_confirm` |
| A confirmation counts for one proposal, for a limited time, once | `Governance: test_confirmations_are_bound_timed_and_single_use` |
| A proposal acts only on the state the operators reviewed: once that changes, it cannot execute | `Governance: test_a_stale_proposal_cannot_execute` |
| The whole deal runs governed, each step by a different pair, and every step is on the record | `Governance: test_operators_run_the_deal_two_of_three` |
| Every other agent choice runs governed the same way | `Governance: test_every_other_agent_choice_runs_governed` |
| No node can submit as the agent, not even the operators' | LocalNet demo |
| With one operator's node offline, the other two settle a payment, and the offline node catches up | LocalNet demo |

The Daml tests run in `make test`. The LocalNet demo runs the deal on three
real participant nodes, each with its own DecMan, and checks each claim
against the ledger.

## Run it

Prerequisites: Docker, `jq`, `curl`, `grpcurl`, `openssl`, Node.js 20 and
dpm, plus a DecMan binary:

```bash
git clone https://github.com/DLC-link/decentralization-manager
cd decentralization-manager
DECMAN_SKIP_FRONTEND=1 cargo build --profile release-ci --features test-mode -p decman
export DECMAN_BIN=$PWD/target/release-ci/dec-party-manager
```

Then, from Pari's root, with `npm install` run once in `web/`:

```bash
make localnet-up     # LocalNet, three DecMan nodes, the agent's party and its rules
make localnet-demo   # the deal, governed, with the checks below
make localnet-down   # stop it and delete its data
```

`localnet-up` downloads the Splice 0.6.13 LocalNet bundle unless
`SPLICE_NODE_DIR` points to one. It starts LocalNet's synchronizer and three
participant nodes, starts a DecMan for each and connects them, onboards
`pari-agent` across all three, allocates one operator on each node and the
deal's other parties on the second, uploads the packages, and deploys the
agent's `GovernanceRules`. The demo then runs the deal:

```
Each action proposed by one operator, confirmed by two, executed by the second:
  PariOpenDesk: proposed by OperationsDesk, confirmed by OperationsDesk and CoAgent
  PariProposeFacility: proposed by CoAgent, confirmed by CoAgent and Trustee
  PariInvite: proposed by Trustee, confirmed by Trustee and OperationsDesk
  ...
  PariRequestInterest: proposed by CoAgent, confirmed by CoAgent and Trustee

Northwind funds the interest due, and the operators settle it:
  ok  OperationsDesk's node cannot submit as the agent on its own
  ok  CoAgent's node cannot submit as the agent on its own
  ok  Trustee's node cannot submit as the agent on its own
  ok  CoAgent alone cannot execute: the rules need 2 confirmations
  ok  no lender was paid on one confirmation
  ok  Alder paid 985,833.33, with OperationsDesk offline
  ok  Birch paid 591,500.00, with OperationsDesk offline
  ok  Cedar paid 394,333.33, with OperationsDesk offline
  ok  OperationsDesk's node caught up: interest paid through 2026-12-15
  ...
  ok  the settlement was confirmed by CoAgent and Trustee, without OperationsDesk

Settled 1,971,666.66 of interest on NORTHWIND-TLB-2026, two of three.
```

To take the outage, the demo disconnects the first operator's node from the
synchronizer (`scripts/localnet.sh offline 1`), and reconnects it once the
payment has settled (`scripts/localnet.sh online 1`).

## Scope

- **One machine.** On LocalNet, all three nodes and their DecMan instances run
  on one Docker host. In production, each operator runs its own node and
  DecMan, and the guarantees above rest on that.
- **Test mode.** DecMan is built with `--features test-mode`, which turns off
  its HTTP authentication and signs to Canton with LocalNet's well-known
  development secret. A production DecMan validates JWTs.
- **Who can be offline.** Executing an action consumes its proposal, signed
  by the proposer, and its confirmations, co-signed by each confirmer, so
  those operators' nodes must be online. Any operator not involved in the
  action can be offline, as OperationsDesk is in the demo.
- **The web app and DevNet.** The web app, and the deal on the HackCanton
  DevNet, still run the agent as one party: the shared DevNet node gives each
  team one participant, and a decentralized party needs several. The governed
  agent runs from the command line (`web/scripts/governed.ts`), through the
  same operations the web app uses.
