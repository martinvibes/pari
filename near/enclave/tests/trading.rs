//! Secondary trading: cash against loan in one step, interest split on the
//! trade date, DQ screening, and what each party can see.
//! Ported from `daml/pari-tests/daml/Pari/Test/Trading.daml` (Canton build, tag `pre-hackathon`).

mod common;

use common::*;
use pari_core::books::{Command, TradeStatus};
use pari_core::interest::Entry;
use pari_core::money::Cents;
use pari_core::views;

fn settle_trade(deal: &mut Deal, trade_id: u64) -> bool {
    let outcome = deal.run(AGENT, Command::SettleTrade { trade_id }).expect("the agent can settle");
    outcome.public["settled"] == true
}

#[test]
fn test_trade_settles_delivery_versus_payment() {
    let mut deal = setup();
    let trade_id = deal.agree_trade(ALDER, DELTA, usd(10_000_000, 0), 995_000);
    assert!(settle_trade(&mut deal, trade_id));

    // Cash: $10m at 99.5 moved from Delta to Alder.
    assert_eq!(deal.cash(ALDER), usd(9_950_000, 0));
    assert_eq!(deal.cash(DELTA), usd(10_050_000, 0));

    // Positions moved with it. Alder keeps the 30 days of interest it earned:
    // 50m * 7.80% * 30/360 = 325,000.00, of which 65,000.00 on the part sold.
    assert_eq!(
        deal.books.register[ALDER],
        Entry { principal: usd(40_000_000, 0), accrual_start: mid_period(), carried: usd(325_000, 0) }
    );
    assert_eq!(
        deal.books.register[DELTA],
        Entry { principal: usd(10_000_000, 0), accrual_start: mid_period(), carried: Cents::ZERO }
    );
    assert_eq!(deal.books.outstanding(), usd(100_000_000, 0));
}

#[test]
fn test_interest_is_split_on_the_trade_date() {
    let mut deal = setup();
    let trade_id = deal.agree_trade(ALDER, DELTA, usd(10_000_000, 0), 995_000);
    assert!(settle_trade(&mut deal, trade_id));

    // Alder: 325,000.00 for 30 days on 50m, plus 528,666.66 for 61 days on 40m.
    // Delta: 61 days on 10m. Birch and Cedar are unchanged.
    let total = usd(853_666, 66) + usd(132_166, 66) + BIRCH_DUE + CEDAR_DUE;
    let request_id = deal.request_interest(total);
    deal.pay(request_id, total);

    assert_eq!(deal.cash(ALDER), usd(9_950_000, 0) + usd(853_666, 66));
    assert_eq!(deal.cash(DELTA), usd(10_050_000, 0) + usd(132_166, 66));
}

#[test]
fn test_full_exit_keeps_earned_interest() {
    let mut deal = setup();
    let trade_id = deal.agree_trade(CEDAR, DELTA, usd(20_000_000, 0), 1_000_000);
    assert!(settle_trade(&mut deal, trade_id));

    // Cedar sold everything but is still owed 30 days of interest.
    assert_eq!(deal.books.register[CEDAR].principal, Cents::ZERO);

    let total = ALDER_DUE + BIRCH_DUE + usd(130_000, 0) + usd(264_333, 33);
    let request_id = deal.request_interest(total);
    deal.pay(request_id, total);

    assert_eq!(deal.cash(CEDAR), usd(20_000_000, 0) + usd(130_000, 0));
    // Once paid, Cedar leaves the register.
    assert!(!deal.books.register.contains_key(CEDAR));
}

#[test]
fn test_dq_listed_buyer_is_refused() {
    let mut deal = setup();
    let trade_id = deal.agree_trade(ALDER, RIVAL, usd(10_000_000, 0), 995_000);
    assert!(!settle_trade(&mut deal, trade_id));

    // Nothing moved.
    assert_eq!(deal.cash(RIVAL), usd(20_000_000, 0));
    assert_eq!(deal.cash(ALDER), Cents::ZERO);
    assert!(!deal.books.register.contains_key(RIVAL));
    assert_eq!(deal.books.register[ALDER].principal, usd(50_000_000, 0));
    assert_eq!(deal.books.trades[0].status, TradeStatus::NotSettled);

    // The rival sees "not settled" and nothing about the list or the screening.
    let rival = views::view(&deal.books, RIVAL).to_string();
    assert!(rival.contains("not_settled"));
    assert!(!rival.contains("DQ") && !rival.contains("dq_list") && !rival.contains("screening"));
    // The agent sees why.
    let agent = views::view(&deal.books, AGENT).to_string();
    assert!(agent.contains("the buyer is on the DQ list"));
}

#[test]
fn test_trade_privacy() {
    let mut deal = setup();
    let trade_id = deal.agree_trade(ALDER, DELTA, usd(10_000_000, 0), 995_000);
    assert!(settle_trade(&mut deal, trade_id));
    let request_id = deal.request_interest(usd(853_666, 66) + usd(132_166, 66) + BIRCH_DUE + CEDAR_DUE);
    deal.pay(request_id, usd(1_971_666, 65));
    let view = |party| views::view(&deal.books, party).to_string();

    // The borrower and the auditor see the trade but never the price.
    for party in [BORROWER, AUDITOR] {
        assert!(view(party).contains(r#""par":"1000000000""#));
        assert!(!view(party).contains("price_ppm") && !view(party).contains("995000"));
    }
    // The auditor and the buyer never learn the DQ list.
    assert!(view(BORROWER).contains(RIVAL));
    assert!(!view(AUDITOR).contains(RIVAL) && !view(DELTA).contains(RIVAL));

    // Seller and buyer see the price; neither sees what the other holds.
    assert!(view(ALDER).contains(r#""price_ppm":995000"#) && view(DELTA).contains(r#""price_ppm":995000"#));
    assert!(!view(DELTA).contains("4000000000") && !view(ALDER).contains(r#""principal":"1000000000""#));

    // Lenders outside the trade see nothing of it, and nothing of each other.
    let birch = view(BIRCH);
    assert!(birch.contains(r#""trades":[]"#));
    assert!(birch.contains("59150000")); // its own payment
    for other in [ALDER, CEDAR, DELTA] {
        assert!(!birch.contains(other));
    }
    assert!(!birch.contains("85366666") && !birch.contains("39433333"));
}
