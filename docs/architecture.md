# Architecture

Pari is the administrative-agent ledger for a syndicated or private-credit
loan: the register of who holds the loan, the interest and principal
payments, secondary trades, and the information walls around them.

## Parties

| Party | Role |
|---|---|
| **Agent** | Administers the facility: keeps the register, fixes rates, requests and settles payments, settles trades, distributes documents. Holds no money. |
| **Borrower** | Signs the facility, pays interest and principal, keeps the DQ list, posts documents. |
| **Lenders** | Each holds a private, co-signed position. |
| **Buyers** | Funds buying into the loan from an existing lender. |
| **Auditor** | The borrower's auditor, appointed by the borrower. Observes the facility, controls no choice, holds no money. |
| **Registry** | The CIP-56 instrument admin: a test token in the test suite and on the sandbox; Canton Coin's DSO on DevNet. |

## Contracts

```
FacilityProposal ──accept──▶ Facility (agent, borrower)
                                │  register: lender → principal, accrual start, interest carried
                                │
   Facility_Invite ──▶ CommitmentOffer ──accept──▶ Commitment ──Facility_Close──▶ Position (agent, lender)
                                │
   Facility_FixRate ──▶ period with base rate
   Facility_RequestInterest ──▶ PaymentRequest (CIP-56 AllocationRequest, one leg per lender)
   PrepaymentNotice (borrower) ──Facility_AcceptPrepayment──▶ PaymentRequest (principal legs)
   Facility_Settle ──▶ Position_Settle × N ──▶ Allocation_ExecuteTransfer × N, Receipt × N

TradeOffer (seller) ──accept──▶ TradeTicket (seller, buyer)
DqList (borrower) ──DqList_Screen──▶ ScreeningResult (borrower, agent)
AgentDesk_SettleTrade ──▶ Facility_RecordAssignment · TradeTicket_Settle · SellDown_Apply · BuyIn_Apply

InfoElection (lender) + Document (borrower) ──Document_Share──▶ DocumentAccess
```

## Settlement is CIP-56 end to end

Pari never holds, mints or moves tokens itself. Every payment is a standard
CIP-56 allocation created by the payer's own wallet against a Pari request,
and executed by the agent only after Pari checks the allocation's
specification equals the expected leg exactly:

| Flow | Request (implements `AllocationRequest`) | Legs | Executed by |
|---|---|---|---|
| Closing | `Commitment` | lender → borrower, the commitment | `Facility_Close` |
| Interest | `PaymentRequest` | borrower → each lender, its interest | `Facility_Settle` |
| Principal | `PaymentRequest` | borrower → each lender, its pro-rata share | `Facility_Settle` |
| Trade | `TradeTicket` | buyer → seller, the price | `Desk_SettleTrade` |

Because each request is a standard `AllocationRequest`, any CIP-56 wallet can
show it and fund it, in Canton Coin or any other token-standard instrument.

## Who sees what

Canton shows a transaction node only to its informees: the stakeholders of the
contract it acts on, plus the parties exercising it. Pari arranges each
workflow so that every party is an informee of its own part only.

**Interest payment.** The root is `Facility_Settle` on the facility, seen by
the agent, the borrower and the borrower's auditor. Under it, one `Position_Settle` per lender, each seen
by the agent, the borrower and that one lender. Lender A sees its own
allocation execute and its receipt. It never sees the facility, the request,
the rate applied to others, or any other lender's leg. The request is never
fetched inside a lender's subtree, so it is never disclosed to a lender.

**Trade.** The root is `Desk_SettleTrade` on the agent's own desk, seen by the
agent alone. Under it are four siblings:

| Step | Informees | Learns |
|---|---|---|
| `Facility_RecordAssignment` | agent, borrower, auditor | seller, buyer, par amount, trade date, DQ clearance |
| `TradeTicket_Settle` | agent, seller, buyer | the price and cash leg |
| `SellDown_Apply` | agent, seller | the seller's remaining position |
| `BuyIn_Apply` | agent, buyer | the buyer's new position |

So the borrower never learns the price; the buyer never learns what the seller
still holds; the seller never learns what else the buyer holds; other lenders
see nothing. Tests: `Trading: test_trade_privacy`.

**The auditor.** Appointed by the borrower, the auditor is an observer of the
facility, so it is an informee of every choice on it and witnesses each
closing, payment, prepayment and assignment with its subtree: the register
before and after, and each lender's CIP-56 transfer. The app rebuilds its
audit trail from those events alone and re-checks every figure: the closing
funds the full commitment, interest recomputes from the register, payments
are pro rata with no lender overpaid, every leg arrives in cash to the cent,
and assignments move principal without creating any. It never sees a trade's
price, the DQ list or the data room, and once removed it sees nothing new.
Tests: `Audit`.

**DQ screening.** `DqList_Screen` is exercised by the agent on the borrower's
list, so its informees are the borrower and agent. The buyer is never an
informee: it does not see the list or even the screening result. A refused
buyer simply cannot settle. Tests: `Trading: test_dq_listed_buyer_is_refused`.

**Information walls.** A document reaches a lender only as a `DocumentAccess`
created for that lender; MNPI requires the lender's own private-side
election. Tests: `Disclosure`.

## Why this needs Canton

Run the same loan on a transparent chain and each of these breaks:

- **The register is public.** Every lender's holding and every trade price is
  visible to competitors, borrowers' other creditors and the lenders' own
  counterparties.
- **The DQ list leaks.** Screening on-chain publishes who the borrower blocks.
- **MNPI walls are impossible.** Anything posted on-chain is readable by
  public-side lenders, which would put them over the wall.
- **Per-party consent is lost.** A transparent chain has no notion of a
  position co-signed by its holder. Canton's signatory model is what keeps
  the agent from moving a lender's position.

Canton gives per-party privacy and multi-party authorization in the same
atomic transaction, which is exactly what agency work needs.

## Interest maths

- ACT/360 simple interest on the all-in rate (base + margin), rounded down to
  cents.
- A trade splits interest on the agreed trade date: the seller's accrual so far
  moves into `carried` and the buyer accrues from that date. On the payment
  date each holder is paid exactly what it earned while it held the loan.
- A short payment pays every lender the same fraction; the unpaid remainder
  stays as `carried` and is requested again next period.
- Principal prepayments are split pro rata; leftover cents go to the largest
  holder so the legs sum to exactly the notice amount.
