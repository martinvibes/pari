//! Interest: ACT/360 maths, one payment to every lender in one step, and
//! short payments that cannot favour any lender.
//! Ported from `daml/pari-tests/daml/Pari/Test/Interest.daml` (Canton build, tag `pre-hackathon`).

mod common;

use common::*;
use pari_core::books::{Command, Purpose, RequestStatus};
use pari_core::interest::{accrual, all_in_rate_bps};
use pari_core::money::Cents;

#[test]
fn test_interest_maths() {
    assert_eq!(all_in_rate_bps(350, 430), 780);
    assert_eq!(accrual(usd(50_000_000, 0), 780, closing(), first_period_end()), ALDER_DUE);
    // Short accruals still round down.
    assert_eq!(accrual(usd(1_000, 0), 780, closing(), date("2026-09-16")), usd(0, 21));
    assert_eq!(first_period_end().days_since(closing()), 91);
}

#[test]
fn test_interest_paid_to_every_lender_in_one_step() {
    let mut deal = setup();
    let request_id = deal.request_interest(TOTAL_DUE);

    let request = deal.books.open_request().unwrap();
    let legs: Vec<(&str, Cents)> = request.legs.iter().map(|(l, c)| (l.as_str(), *c)).collect();
    assert_eq!(legs, [(ALDER, ALDER_DUE), (BIRCH, BIRCH_DUE), (CEDAR, CEDAR_DUE)]);

    deal.pay(request_id, TOTAL_DUE);

    assert_eq!(deal.cash(ALDER), ALDER_DUE);
    assert_eq!(deal.cash(BIRCH), BIRCH_DUE);
    assert_eq!(deal.cash(CEDAR), CEDAR_DUE);
    assert_eq!(deal.cash(BORROWER), Cents::ZERO);

    assert_eq!(deal.books.paid_through, first_period_end());
    assert_eq!(deal.books.period, None);
    assert!(deal.books.open_request().is_none());
    assert_eq!(deal.books.requests[0].status, RequestStatus::Settled);
    for entry in deal.books.register.values() {
        assert_eq!(entry.carried, Cents::ZERO);
        assert_eq!(entry.accrual_start, first_period_end());
    }
}

#[test]
fn test_short_payment_is_shared_pro_rata() {
    let mut deal = setup();
    let request_id = deal.request_interest(TOTAL_DUE);

    // The borrower can fund only half: every lender gets half of what it is owed.
    deal.pay(request_id, usd(985_833, 33));

    assert_eq!(deal.cash(ALDER), usd(492_916, 66));
    assert_eq!(deal.cash(BIRCH), usd(295_750, 0));
    assert_eq!(deal.cash(CEDAR), usd(197_166, 66));
    // The cent lost to rounding down goes back to the borrower.
    assert_eq!(deal.cash(BORROWER), usd(0, 1));

    // The unpaid half stays owed and rolls into the next period's request.
    let carried: Vec<Cents> = deal.books.register.values().map(|e| e.carried).collect();
    assert_eq!(carried, [usd(492_916, 67), usd(295_750, 0), usd(197_166, 67)]);
}

#[test]
fn test_borrower_cannot_favour_a_lender() {
    let mut deal = setup();
    let request_id = deal.request_interest(TOTAL_DUE);

    // The borrower sends Alder's leg in full and half of the others. The money
    // is one pot: there is no way to name a lender, so it is shared pro rata.
    let funded = ALDER_DUE + usd(295_750, 0) + usd(197_166, 66);
    deal.pay(request_id, funded);

    for (lender, due) in [(ALDER, ALDER_DUE), (BIRCH, BIRCH_DUE), (CEDAR, CEDAR_DUE)] {
        assert_eq!(deal.cash(lender), Cents(funded.0 * due.0 / TOTAL_DUE.0));
        assert!(deal.cash(lender) < due);
    }
}

#[test]
fn test_every_lender_is_paid_or_none_is() {
    let mut deal = setup();
    let request_id = deal.request_interest(TOTAL_DUE);
    let before = deal.books.clone();

    // With nothing funded the settlement is refused and the books do not move.
    assert!(deal.run(AGENT, Command::Settle { request_id }).is_err());
    assert_eq!(deal.books, before);
    assert_eq!(deal.cash(ALDER), Cents::ZERO);

    // Once funded, all three are paid by the same command.
    deal.deposit(BORROWER, TOTAL_DUE, Purpose::Pay { request_id });
    deal.run(AGENT, Command::Settle { request_id }).unwrap();
    assert!([ALDER, BIRCH, CEDAR].iter().all(|l| deal.cash(l) > Cents::ZERO));
}
