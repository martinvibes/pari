# Pari

**The private ledger for syndicated loans, on Canton.**

Pari is an administrative-agent platform for syndicated and private-credit
loans. It keeps the lender register, pays interest and principal to every
lender in one atomic step, settles secondary trades delivery-versus-payment,
screens buyers against the borrower's secret DQ list, and enforces MNPI
walls. Each lender sees its own position and nothing else, every token
movement is a standard CIP-56 allocation funded by the paying party itself,
and the borrower's auditor reconciles the deal from the ledger's own history.

Built for HackCanton Season 3, track: RWA & Business Workflows.

## Why

Loan agency still runs on email, PDFs and spreadsheets.

- **Payments go wrong.** In 2020 Citibank, as agent, mistakenly sent Revlon's
  lenders about $900m of its own money instead of an interest payment.
- **Trades settle slowly.** Par loan trades routinely take more than a week
  to settle, with assignments chased by email and accrued interest split by
  hand.
- **Privacy is all or nothing.** Lenders must not see each other's holdings,
  buyers must not see the borrower's DQ list, and public-side lenders must not
  receive material non-public information. A transparent chain breaks all
  three.

## What works today

Every claim below is a Daml Script test in
[`daml/pari-tests`](daml/pari-tests/daml/Pari/Test).

| Pari guarantees | Test |
|---|---|
| Closing funds the borrower from every lender in one transaction, or not at all | `Syndication: test_closing_funds_borrower_atomically`, `test_closing_fails_unless_fully_committed` |
| Each lender sees only its own position; the register stays with the agent, the borrower and the borrower's auditor | `Syndication: test_lenders_see_only_their_own_position` |
| Interest (ACT/360) is paid to every lender in one step, to the cent | `Interest: test_interest_paid_to_every_lender_in_one_step` |
| A short payment is shared pro rata, and the unpaid part stays owed | `Interest: test_short_payment_is_shared_pro_rata` |
| No lender can be favoured, and no lender can be left out | `Interest: test_borrower_cannot_favour_a_lender`, `test_every_lender_is_paid_or_none_is` |
| Trades settle delivery-versus-payment | `Trading: test_trade_settles_delivery_versus_payment` |
| Interest is split to the day when a loan changes hands | `Trading: test_interest_is_split_on_the_trade_date`, `test_full_exit_keeps_earned_interest` |
| A buyer on the borrower's DQ list is refused, without ever seeing the list | `Trading: test_dq_listed_buyer_is_refused` |
| The borrower never sees the trade price; buyer and seller never see each other's positions | `Trading: test_trade_privacy` |
| Principal moves only on the borrower's own notice, pro rata | `Principal: test_agent_cannot_originate_a_principal_payment`, `test_prepayment_is_shared_pro_rata` |
| No settlement can pay a lender more than its leg (the Revlon guard) | `Principal: test_settlement_cannot_pay_more_than_requested` |
| The agent never holds the money: every payment moves from payer to payee directly | `Authority: test_agent_never_holds_the_money` |
| A payment the agent cancels, or a trade it declines, moves nothing: the payer takes its own cash back | `Authority: test_cancelled_request_returns_the_borrowers_cash`, `test_declined_trade_returns_the_buyers_cash` |
| The agent cannot create, move or shrink a lender's position, or move tokens alone | `Authority` |
| MNPI reaches private-side lenders only, and only the lender can cross the wall | `Disclosure` |
| Only the borrower appoints its auditor, who follows the register through every payment and trade and can act on nothing | `Audit: test_only_the_borrower_appoints_the_auditor`, `test_auditor_follows_the_register`, `test_auditor_acts_on_nothing` |
| The auditor never holds a trade price, the DQ list or a document; once removed, it sees nothing new | `Audit: test_auditor_holds_no_price_dq_list_or_document`, `test_removed_auditor_sees_nothing_new` |
| A hundred lenders: the closing, an interest payment and a prepayment each settle in one transaction, to the cent | `Scale: test_a_hundred_lenders_settle_in_one_transaction_each` |

The full list of choices and what each can move is in the
[authority matrix](docs/authority-matrix.md). How the workflows keep each
party's view private is in [architecture](docs/architecture.md).

## Run it

Prerequisites: [dpm](https://docs.digitalasset.com) with SDK 3.5.12, a Java
17+ runtime, and Node.js 20.

```bash
make test        # build and run every Daml Script test
```

To run the app against a local Canton ledger:

```bash
make sandbox     # terminal 1: a Canton sandbox with Pari loaded
make seed        # terminal 2: the demo deal, party ids to web/.pari/cast.json
cd web && npm install && npm run dev
```

Then open `http://localhost:3000/agent`. There is a screen for the agent, the
borrower, each lender or buyer and the borrower's auditor, plus `/visibility`,
which runs every party's own ledger query side by side. The walkthrough is in the docs
Quickstart. Run `make seed` again at any time to start over with a fresh deal
and fresh parties on the same ledger.

With the sandbox up, `make smoke` seeds a deal of its own and drives it
through every write the app offers (trades, a refused and declined trade,
cancelled, short and full payments, a prepayment, the next period, the
information wall, the DQ list and the auditor), checking the ledger's figures
against the Daml tests and every privacy claim against each party's own view.
For the auditor it reads every event the auditor's node received, not just
the contracts it holds, and checks that none is a trade offer or ticket, the
DQ list or a document.

`make scale` runs the scale test's deal on the sandbox with a hundred new
lenders, checking every balance and share and timing each step by the wall
clock. On an Apple M2 Pro with Canton 3.5.19, the hundred-lender closing took
3.0 s, the interest payment 4.6 s and the prepayment 4.4 s, each one atomic
transaction.

To run it on the HackCanton DevNet instead, create the parties and upload the
DAR in the node's Console, then `make devnet-login`, `make devnet-seed` and
`make devnet-web`: see [docs/devnet.md](docs/devnet.md). The smoke test
passed there on 6 October, and that page lists the update ids of the closing,
a trade, an interest payment and a prepayment.

The demo server signs as every party so one browser can play the whole deal.
Each screen still reads the ledger as its own party, and every action is
submitted as the one party entitled to it, so the ledger enforces the same
authority it would with each party on its own node.

## Repo layout

```
daml/pari/         The Pari model
daml/pari-tests/   Daml Script tests for every guarantee above
daml/pari-demo/    Seed script for the demo deal, on a sandbox or DevNet
daml/dars/         Vendored Splice token-standard packages (see its README)
docs/              Architecture, authority matrix and DevNet guide
web/               Website, docs and app (Next.js)
```

## Status

| | |
|---|---|
| Daml model and test suite | Done |
| Web app for agent, lenders, borrower and buyers, on a local Canton sandbox | Done |
| Deployment on the HackCanton DevNet, settling in a CIP-56 test token | Done |
| The borrower's auditor, with an audit trail rebuilt and re-checked from the ledger | Done |
| A hundred lenders per transaction, tested and timed on a Canton sandbox | Done |
| Settlement in Canton Coin or a stablecoin | Planned |
| Agent hosted as a decentralized party across independent operators | Planned |

## Disclosure

The Pari model, tests and docs were designed and written from scratch during
HackCanton Season 3. Pari depends on the unmodified Splice token-standard
packages (Apache-2.0), vendored in `daml/dars/`. The web app's visual layer is
derived from the [sidereal-hedera](https://github.com/guha-rahul/sidereal-hedera)
web app (Apache-2.0), with credit to its authors. See [NOTICE](NOTICE).

## License

Apache-2.0. See [LICENSE](LICENSE).
