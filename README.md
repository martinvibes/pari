# Pari

**The private ledger for syndicated loans, on Canton.**

Pari is an administrative-agent platform for syndicated and private-credit
loans. It keeps the lender register, pays interest and principal to every
lender in one atomic step, settles secondary trades delivery-versus-payment,
screens buyers against the borrower's secret DQ list, and enforces MNPI
walls. Each lender sees its own position and nothing else, and every token
movement is a standard CIP-56 allocation funded by the paying party itself.

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
| Each lender sees only its own position; the register stays with agent and borrower | `Syndication: test_lenders_see_only_their_own_position` |
| Interest (ACT/360) is paid to every lender in one step, to the cent | `Interest: test_interest_paid_to_every_lender_in_one_step` |
| A short payment is shared pro rata, and the unpaid part stays owed | `Interest: test_short_payment_is_shared_pro_rata` |
| No lender can be favoured, and no lender can be left out | `Interest: test_borrower_cannot_favour_a_lender`, `test_every_lender_is_paid_or_none_is` |
| Trades settle delivery-versus-payment | `Trading: test_trade_settles_delivery_versus_payment` |
| Interest is split to the day when a loan changes hands | `Trading: test_interest_is_split_on_the_trade_date`, `test_full_exit_keeps_earned_interest` |
| A buyer on the borrower's DQ list is refused, without ever seeing the list | `Trading: test_dq_listed_buyer_is_refused` |
| The borrower never sees the trade price; buyer and seller never see each other's positions | `Trading: test_trade_privacy` |
| Principal moves only on the borrower's own notice, pro rata | `Principal: test_agent_cannot_originate_a_principal_payment`, `test_prepayment_is_shared_pro_rata` |
| No settlement can pay a lender more than its leg (the Revlon guard) | `Principal: test_settlement_cannot_pay_more_than_requested` |
| The agent cannot create, move or shrink a lender's position, or move tokens alone | `Authority` |
| MNPI reaches private-side lenders only, and only the lender can cross the wall | `Disclosure` |

The full list of choices and what each can move is in the
[authority matrix](docs/authority-matrix.md). How the workflows keep each
party's view private is in [architecture](docs/architecture.md).

## Run it

Prerequisites: [dpm](https://docs.digitalasset.com) with SDK 3.5.12, and a
Java 17+ runtime for the test runner.

```bash
make test
```

## Repo layout

```
daml/pari/         The Pari model
daml/pari-tests/   Daml Script tests for every guarantee above
daml/dars/         Vendored Splice token-standard packages (see its README)
docs/              Architecture and authority matrix
web/               Website, docs and app (Next.js)
```

## Status

| | |
|---|---|
| Daml model and test suite | Done |
| Web app for agent, lenders, borrower and buyers | In progress |
| Deployment on the HackCanton DevNet, settling in Canton Coin | In progress |
| Agent hosted as a decentralized party across independent operators | Planned |

## Disclosure

The Pari model, tests and docs were designed and written from scratch during
HackCanton Season 3. Pari depends on the unmodified Splice token-standard
packages (Apache-2.0), vendored in `daml/dars/`. The web app's visual layer is
derived from the [sidereal-hedera](https://github.com/guha-rahul/sidereal-hedera)
web app (Apache-2.0), with credit to its authors. See [NOTICE](NOTICE).

## License

Apache-2.0. See [LICENSE](LICENSE).
