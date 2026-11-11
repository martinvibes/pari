//! The guards against a Revlon-style mistaken payment.
//! Ported from `daml/pari-tests/daml/Pari/Test/Principal.daml` (prepayment is
//! not part of the NEAR build).

mod common;

use common::*;
use pari_core::books::{Command, Refusal};
use pari_core::money::Cents;

#[test]
fn test_settlement_cannot_pay_more_than_requested() {
    let mut deal = setup();
    let request_id = deal.request_interest(TOTAL_DUE);

    // The payment carries principal plus interest, as in Revlon.
    let outcome = deal.pay(request_id, TOTAL_DUE + usd(50_000_000, 0));

    // Lenders get their interest and not a cent more; the rest never left the borrower.
    assert_eq!(deal.cash(ALDER), ALDER_DUE);
    assert_eq!(deal.cash(BIRCH), BIRCH_DUE);
    assert_eq!(deal.cash(CEDAR), CEDAR_DUE);
    assert_eq!(deal.cash(BORROWER), usd(50_000_000, 0));
    assert_eq!(outcome.public["credited"], "197166666");
    assert_eq!(outcome.public["funded"], "197166666");
}

#[test]
fn test_agent_cannot_request_more_than_the_register_says() {
    let mut deal = setup();
    let before = deal.books.clone();

    // The agent types $900,000,000 instead of $1,971,666.66.
    let refused = deal.run(AGENT, Command::RequestInterest { expected_total: usd(900_000_000, 0) });

    assert_eq!(refused, Err(Refusal("You entered 900,000,000.00; the register says 1,971,666.66.".into())));
    assert_eq!(deal.books, before);
}

#[test]
fn test_no_settlement_without_an_open_request() {
    let mut deal = setup();
    assert!(deal.run(AGENT, Command::Settle { request_id: 1 }).is_err());

    let request_id = deal.request_interest(TOTAL_DUE);
    deal.pay(request_id, TOTAL_DUE);
    // A settled request cannot be settled again.
    assert!(deal.run(AGENT, Command::Settle { request_id }).is_err());
    assert_eq!(deal.cash(ALDER), ALDER_DUE);
}

#[test]
fn test_withdrawal_is_capped_by_the_party_s_cash() {
    let mut deal = setup();
    let request_id = deal.request_interest(TOTAL_DUE);
    deal.pay(request_id, TOTAL_DUE);

    assert!(deal.run(ALDER, Command::Withdraw { amount: ALDER_DUE + usd(0, 1) }).is_err());
    let outcome = deal.run(ALDER, Command::Withdraw { amount: ALDER_DUE }).unwrap();
    assert_eq!(outcome.payouts.len(), 1);
    assert_eq!((outcome.payouts[0].to.as_str(), outcome.payouts[0].amount), (ALDER, ALDER_DUE));
    assert_eq!(deal.cash(ALDER), Cents::ZERO);
}
