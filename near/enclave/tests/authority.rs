//! Authority: each command runs only for the party entitled to it.
//! Mirrors `daml/pari-tests/daml/Pari/Test/Authority.daml`.

mod common;

use common::*;
use pari_core::books::{Command, Purpose};

#[test]
fn test_only_the_right_party_can_run_each_command() {
    let mut deal = setup();
    let everyone = [LEDGER, AGENT, BORROWER, AUDITOR, ALDER, BIRCH, CEDAR, DELTA, RIVAL];
    let refused_for_all_but = |deal: &Deal, allowed: &str, command: Command| {
        for caller in everyone.iter().filter(|c| **c != allowed) {
            let mut copy = Deal { books: deal.books.clone() };
            assert!(copy.run(caller, command.clone()).is_err(), "{caller} ran {command:?}");
        }
        let mut copy = Deal { books: deal.books.clone() };
        assert!(copy.run(allowed, command.clone()).is_ok(), "{allowed} could not run {command:?}");
    };

    // Only the agent requests interest; only the borrower sets the DQ list;
    // only the rules contract records money coming in.
    refused_for_all_but(&deal, AGENT, Command::RequestInterest { expected_total: TOTAL_DUE });
    refused_for_all_but(&deal, BORROWER, Command::SetDq { list: Default::default() });
    let deposit = Command::Deposit { party: ALDER.into(), amount: usd(1, 0), purpose: Purpose::Cash };
    refused_for_all_but(&deal, LEDGER, deposit);

    // Only the holder can offer its position, only the named buyer can accept,
    // and only the agent can settle the trade.
    let offer = Command::OfferTrade { buyer: DELTA.into(), par: usd(45_000_000, 0), price_ppm: 995_000, trade_date: mid_period() };
    refused_for_all_but(&deal, ALDER, offer.clone());
    deal.run(ALDER, offer).unwrap();
    refused_for_all_but(&deal, DELTA, Command::AcceptTrade { trade_id: 1 });
    deal.run(DELTA, Command::AcceptTrade { trade_id: 1 }).unwrap();
    refused_for_all_but(&deal, AGENT, Command::SettleTrade { trade_id: 1 });

    // Only the agent settles a payment, and nobody can fix a second rate mid-period.
    let request_id = deal.request_interest(TOTAL_DUE);
    deal.deposit(BORROWER, TOTAL_DUE, Purpose::Pay { request_id });
    refused_for_all_but(&deal, AGENT, Command::Settle { request_id });
    for caller in everyone {
        assert!(deal.run(caller, Command::FixRate { base_rate_bps: 500, period_end: date("2027-03-15") }).is_err());
    }
}

#[test]
fn test_a_party_can_only_move_its_own_cash() {
    let mut deal = setup();
    // Delta holds 20m; nobody else can withdraw it, because a withdrawal always
    // pays the caller from the caller's own balance.
    for caller in [AGENT, BORROWER, ALDER, AUDITOR] {
        assert!(deal.run(caller, Command::Withdraw { amount: usd(1, 0) }).is_err());
    }
    let outcome = deal.run(DELTA, Command::Withdraw { amount: usd(1, 0) }).unwrap();
    assert_eq!(outcome.payouts[0].to, DELTA);
}

#[test]
fn test_the_deal_is_set_up_once_and_the_root_tracks_every_change() {
    let mut deal = setup();
    let before = deal.books.root();
    deal.run(DELTA, Command::RegisterViewKey { pubkey: "a2V5".into() }).unwrap();
    assert_ne!(deal.books.root(), before);
    assert_eq!(deal.books.root().len(), 64);

    let again = Command::InitDeal {
        terms: deal.books.terms.clone(),
        agent: RIVAL.into(),
        borrower: RIVAL.into(),
        auditor: RIVAL.into(),
        positions: [(RIVAL.to_string(), usd(1, 0))].into(),
    };
    assert!(deal.run(LEDGER, again).is_err());
}
