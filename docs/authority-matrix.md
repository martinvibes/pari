# Authority matrix

Every choice in the Pari model, who controls it, and what it can move. Value
only ever moves by executing a CIP-56 allocation that the paying party created
from its own holdings; a CIP-56 allocation can only be executed with the
authority of its executor, sender and receiver together.

## What the agent can never do

Each line is enforced by the ledger and covered by a test in
[`daml/pari-tests`](../daml/pari-tests/daml/Pari/Test).

| The agent cannot… | Why | Test |
|---|---|---|
| create a position for anyone | `Position` is co-signed by the lender | `Authority: test_agent_cannot_create_a_position` |
| shrink, move or archive a lender's position | every position choice needs the lender, or the borrower for payments | `Authority: test_agent_cannot_move_a_position` |
| move tokens on its own | allocations need executor, sender and receiver | `Authority: test_agent_cannot_pay_out_without_the_borrower` |
| hold the money in transit | every allocation pays its receiver directly from the payer's holdings | `Authority: test_agent_never_holds_the_money` |
| keep cash funded for a payment or trade it calls off | cancelling or declining moves nothing; only the payer can withdraw its allocation | `Authority: test_cancelled_request_returns_the_borrowers_cash`, `test_declined_trade_returns_the_buyers_cash` |
| start a principal repayment | principal moves only against a borrower-signed `PrepaymentNotice` | `Principal: test_agent_cannot_originate_a_principal_payment` |
| pay any lender more than its leg | each allocation must equal the expected leg to the cent | `Principal: test_settlement_cannot_pay_more_than_requested` |
| pay some lenders and not others | all legs settle in one transaction or none do | `Interest: test_every_lender_is_paid_or_none_is` |
| favour one lender in a short payment | every lender receives the same fraction | `Interest: test_borrower_cannot_favour_a_lender` |
| clear a buyer against the DQ list itself | a clearance is co-signed by the borrower via its list | `Authority: test_agent_cannot_clear_a_buyer_itself` |
| edit the borrower's DQ list | only the borrower controls it | `Authority: test_only_the_borrower_edits_the_dq_list` |
| put a lender over the information wall | only the lender can elect private side | `Disclosure: test_crossing_the_wall_is_the_lenders_choice` |

A lender cannot inflate its own position either
(`Authority: test_lender_cannot_inflate_its_position`).

## Choices

| Contract (signatories) | Choice | Controller | Can move | Guard |
|---|---|---|---|---|
| `FacilityProposal` (agent) | `Accept` / `Reject` | borrower | nothing | borrower signs the terms |
| `Facility` (agent, borrower) | `Facility_Invite` | agent | nothing | facility is syndicating |
| | `Facility_Close` | agent | each lender's own funding allocation to the borrower | commitments sum to the facility size, one per lender |
| | `Facility_FixRate` | agent | nothing | no open period or request |
| | `Facility_RequestInterest` | agent | nothing | legs computed from the register |
| | `Facility_AcceptPrepayment` | agent | nothing | needs the borrower's `PrepaymentNotice`, between periods |
| | `Facility_Settle` | agent | the borrower's allocations, one per lender | each allocation equals its leg × the same fraction; all or none |
| | `Facility_CancelRequest` | agent | nothing | an open request exists |
| | `Facility_RecordAssignment` | agent | register entries only | consumes a borrower-signed clearance for that buyer |
| `PaymentRequest` (agent) | CIP-56 `Reject` / `Withdraw` | borrower / agent | nothing | disabled: payments go through the facility |
| `PrepaymentNotice` (borrower) | `Accept` | agent | nothing | consumed by the facility |
| `CommitmentOffer` (agent, borrower) | `Accept` / `Decline` | lender | nothing | lender signs its commitment |
| `Commitment` (agent, borrower, lender) | `Commitment_Fund` | agent | the lender's own funding allocation | allocation equals the commitment |
| | CIP-56 `Reject` | lender | nothing | lender withdraws before closing |
| `Position` (agent, lender) | `Position_Settle` | agent **and** borrower | the borrower's allocation to this lender | principal matches the register; leg pays this lender |
| | `Position_Reduce` | lender **and** agent | the lender's own principal | amount held |
| | `Position_Increase` | lender **and** agent | the lender's own principal | amount positive |
| `TradeOffer` (seller) | `Accept` / `Reject` | buyer | nothing | buyer signs the ticket |
| | `Withdraw` | seller | nothing | |
| `TradeTicket` (seller, buyer) | `TradeTicket_Settle` | agent | the buyer's cash allocation to the seller | allocation equals the price |
| | CIP-56 `Reject` | buyer | nothing | buyer backs out |
| | CIP-56 `Withdraw` | agent | nothing | agent declines a trade it will not settle |
| `SellDown` (agent, seller) | `SellDown_Apply` | agent | seller's principal, by the traded amount only | issued only by a settled ticket |
| `BuyIn` (agent, buyer) | `BuyIn_Apply` | agent | buyer's principal, by the traded amount only | issued only by a settled ticket |
| `AgentDesk` (agent) | `Desk_SettleTrade` | agent | composes the four steps above atomically | each step's own guards |
| `DqList` (borrower) | `DqList_Update` | borrower | nothing | |
| | `DqList_Screen` | agent | nothing | result co-signed by the borrower |
| `InfoElection` (lender) | `InfoElection_Change` | lender | nothing | |
| `Document` (borrower) | `Document_Share` | agent | nothing | MNPI only to private-side elections |

## Limits, stated plainly

- **The agent is trusted for liveness.** It can decline to settle. It cannot
  keep anyone's cash by doing so: a sender can withdraw its own allocation at
  any time through the standard CIP-56 `Allocation_Withdraw`, and the app
  offers this whenever a payment is cancelled or a trade declined.
- **The agent and the borrower see the register.** That matches syndicated
  lending practice: the agent keeps the register and the borrower may inspect
  it. Lenders see only their own position.
- **One agent party.** The model treats the agent as one party. Hosting it as
  a decentralized party with a threshold across independent operators is a
  deployment concern and does not change the model.
