//! The demo deal from `daml/pari-tests/daml/Pari/Test/Setup.daml`: Northwind
//! Logistics Term Loan B, 100m across Alder (50m), Birch (30m) and Cedar (20m),
//! base 4.30% + 350 bp, first period 2026-09-15 to 2026-12-15 (91 days).
#![allow(dead_code)]

use pari_core::books::{step, Books, Command, Outcome, Purpose, Refusal, Terms};
use pari_core::money::{Cents, Date};

pub const LEDGER: &str = "ledger.paridesk.testnet";
pub const AGENT: &str = "agent.paridesk.testnet";
pub const BORROWER: &str = "northwind.paridesk.testnet";
pub const AUDITOR: &str = "auditor.paridesk.testnet";
pub const ALDER: &str = "alder.paridesk.testnet";
pub const BIRCH: &str = "birch.paridesk.testnet";
pub const CEDAR: &str = "cedar.paridesk.testnet";
pub const DELTA: &str = "delta.paridesk.testnet";
pub const RIVAL: &str = "rival.paridesk.testnet";

/// Dollars and cents, e.g. `usd(985_833, 33)`.
pub const fn usd(dollars: u128, cents: u128) -> Cents {
    Cents(dollars * 100 + cents)
}

pub const ALDER_DUE: Cents = usd(985_833, 33); // 50m * 7.80% * 91/360 = 985,833.333...
pub const BIRCH_DUE: Cents = usd(591_500, 0); // 30m * 7.80% * 91/360
pub const CEDAR_DUE: Cents = usd(394_333, 33); // 20m * 7.80% * 91/360 = 394,333.333...
pub const TOTAL_DUE: Cents = usd(1_971_666, 66);

pub fn date(text: &str) -> Date {
    text.parse().expect("a valid date")
}

pub fn closing() -> Date {
    date("2026-09-15")
}
pub fn mid_period() -> Date {
    date("2026-10-15")
}
pub fn first_period_end() -> Date {
    date("2026-12-15")
}

pub struct Deal {
    pub books: Books,
}

impl Deal {
    pub fn run(&mut self, caller: &str, command: Command) -> Result<Outcome, Refusal> {
        let (books, outcome) = step(Some(&self.books), caller, command)?;
        self.books = books;
        Ok(outcome)
    }

    pub fn cash(&self, party: &str) -> Cents {
        self.books.cash_of(party)
    }

    pub fn deposit(&mut self, party: &str, amount: Cents, purpose: Purpose) {
        self.run(LEDGER, Command::Deposit { party: party.into(), amount, purpose }).expect("deposits are never refused");
    }

    /// The agent requests the period's interest; returns the request number.
    pub fn request_interest(&mut self, total: Cents) -> u64 {
        self.run(AGENT, Command::RequestInterest { expected_total: total }).expect("the total matches the register");
        self.books.open_request().expect("a request is open").id
    }

    /// The borrower pays `amount` towards the request and the agent settles it.
    pub fn pay(&mut self, request_id: u64, amount: Cents) -> Outcome {
        self.deposit(BORROWER, amount, Purpose::Pay { request_id });
        self.run(AGENT, Command::Settle { request_id }).expect("a funded request settles")
    }

    /// A seller offers, the buyer accepts; returns the trade number.
    pub fn agree_trade(&mut self, seller: &str, buyer: &str, par: Cents, price_ppm: u32) -> u64 {
        let offer = Command::OfferTrade { buyer: buyer.into(), par, price_ppm, trade_date: mid_period() };
        self.run(seller, offer).expect("the seller holds the position");
        let trade_id = self.books.trades.last().expect("an offer").id;
        self.run(buyer, Command::AcceptTrade { trade_id }).expect("the buyer accepts");
        trade_id
    }
}

/// The closed deal with the rate fixed for the first period. The two buyers
/// each hold 20m of cash, and Rival is on the borrower's DQ list.
pub fn setup() -> Deal {
    let init = Command::InitDeal {
        terms: Terms {
            facility_id: "NORTHWIND-TLB-2026".into(),
            name: "Northwind Logistics Term Loan B".into(),
            margin_bps: 350,
            closing: closing(),
            maturity: date("2031-09-15"),
        },
        agent: AGENT.into(),
        borrower: BORROWER.into(),
        auditor: AUDITOR.into(),
        positions: [(ALDER, 50_000_000), (BIRCH, 30_000_000), (CEDAR, 20_000_000)]
            .into_iter()
            .map(|(lender, dollars)| (lender.to_string(), usd(dollars, 0)))
            .collect(),
    };
    let (books, _) = step(None, LEDGER, init).expect("the deal opens");
    let mut deal = Deal { books };
    deal.run(AGENT, Command::FixRate { base_rate_bps: 430, period_end: first_period_end() }).expect("the rate is fixed");
    deal.run(BORROWER, Command::SetDq { list: [RIVAL.to_string()].into() }).expect("the borrower sets its list");
    deal.deposit(DELTA, usd(20_000_000, 0), Purpose::Cash);
    deal.deposit(RIVAL, usd(20_000_000, 0), Purpose::Cash);
    deal
}
