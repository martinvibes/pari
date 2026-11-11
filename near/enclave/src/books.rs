//! The books of one syndicated loan and the rules for changing them.
//!
//! `step` is the only way in. It takes the current books, the account the
//! rules contract vouches for, and one command, and returns the new books or a
//! refusal. A refusal leaves the books exactly as they were.

use crate::interest::{all_in_rate_bps, Entry, Period};
use crate::money::{Cents, Date};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

/// A price of 100% of par, in parts per million.
const PAR_PPM: u128 = 1_000_000;

/// Why a command was not applied. The text is returned on the public chain,
/// so it never carries anything the caller could not already see.
#[derive(Debug, PartialEq)]
pub struct Refusal(pub String);

fn refuse<T>(reason: impl Into<String>) -> Result<T, Refusal> {
    Err(Refusal(reason.into()))
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct Terms {
    pub facility_id: String,
    pub name: String,
    pub margin_bps: u32,
    pub closing: Date,
    pub maturity: Date,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct Roles {
    /// The rules contract. Deposits are recorded only on its word.
    pub ledger: String,
    pub agent: String,
    pub borrower: String,
    pub auditor: String,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum RequestStatus {
    Open,
    Settled,
}

/// A request to the borrower for one period's interest.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct Request {
    pub id: u64,
    pub period_end: Date,
    /// What each lender is owed.
    pub legs: BTreeMap<String, Cents>,
    pub total: Cents,
    /// What the borrower has paid in so far. Never more than `total`.
    pub funded: Cents,
    /// What each lender was credited at settlement.
    pub paid: BTreeMap<String, Cents>,
    pub status: RequestStatus,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum TradeStatus {
    Offered,
    Accepted,
    Settled,
    NotSettled,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct Trade {
    pub id: u64,
    pub seller: String,
    pub buyer: String,
    pub par: Cents,
    /// Price in parts per million of par (995000 = 99.5).
    pub price_ppm: u32,
    pub trade_date: Date,
    pub status: TradeStatus,
    /// Why the agent's settlement did not go through. Only the agent sees it.
    pub screening: Option<String>,
}

impl Trade {
    /// The cash the buyer pays, rounded down to cents.
    pub fn cash(&self) -> Cents {
        Cents(self.par.0 * u128::from(self.price_ppm) / PAR_PPM)
    }
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct Books {
    pub terms: Terms,
    pub roles: Roles,
    /// Counts every applied command.
    pub seq: u64,
    pub period: Option<Period>,
    pub paid_through: Date,
    pub register: BTreeMap<String, Entry>,
    pub cash: BTreeMap<String, Cents>,
    pub requests: Vec<Request>,
    pub trades: Vec<Trade>,
    /// The borrower's list of buyers who may not buy into the loan.
    pub dq: BTreeSet<String>,
    /// Each party's X25519 public key (base64) for its sealed view.
    pub view_keys: BTreeMap<String, String>,
    /// 32 random bytes in hex, which the enclave draws again with every
    /// answer. They are in the fingerprint and in no view, so nobody can
    /// confirm a guess at the books by hashing the guess.
    pub blind: String,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Purpose {
    /// Cash a party holds in the books, e.g. a buyer funding a trade.
    Cash,
    /// The borrower paying an interest request, in full or in part.
    Pay { request_id: u64 },
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum Command {
    InitDeal { terms: Terms, agent: String, borrower: String, auditor: String, positions: BTreeMap<String, Cents> },
    FixRate { base_rate_bps: u32, period_end: Date },
    RequestInterest { expected_total: Cents },
    Deposit { party: String, amount: Cents, purpose: Purpose },
    Settle { request_id: u64 },
    SetDq { list: BTreeSet<String> },
    OfferTrade { buyer: String, par: Cents, price_ppm: u32, trade_date: Date },
    AcceptTrade { trade_id: u64 },
    SettleTrade { trade_id: u64 },
    Withdraw { amount: Cents },
    RegisterViewKey { pubkey: String },
}

/// Cash the rules contract must send out of its own balance.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct Payout {
    pub to: String,
    pub amount: Cents,
}

/// What a command produced besides the new books.
#[derive(Debug, PartialEq)]
pub struct Outcome {
    /// Facts safe to publish on chain.
    pub public: Value,
    pub payouts: Vec<Payout>,
}

impl Outcome {
    fn public(public: Value) -> Outcome {
        Outcome { public, payouts: Vec::new() }
    }
}

/// Applies one command. `caller` is the account the rules contract vouches
/// for: the transaction's sender for party commands, the contract itself for
/// `init_deal` and `deposit`.
pub fn step(books: Option<&Books>, caller: &str, command: Command) -> Result<(Books, Outcome), Refusal> {
    match (books, command) {
        (None, Command::InitDeal { terms, agent, borrower, auditor, positions }) => {
            let roles = Roles { ledger: caller.to_string(), agent, borrower, auditor };
            let books = Books::open(terms, roles, positions)?;
            let outcome = Outcome::public(json!({ "facility_id": books.terms.facility_id }));
            Ok((books, outcome))
        }
        (None, _) => refuse("the deal has not been set up"),
        (Some(_), Command::InitDeal { .. }) => refuse("the deal is already set up"),
        (Some(current), command) => {
            let mut next = current.clone();
            let outcome = next.apply(caller, command)?;
            next.seq += 1;
            Ok((next, outcome))
        }
    }
}

impl Books {
    fn open(terms: Terms, roles: Roles, positions: BTreeMap<String, Cents>) -> Result<Books, Refusal> {
        if positions.is_empty() || positions.values().any(|p| *p == Cents::ZERO) {
            return refuse("every lender needs a position");
        }
        let register = positions
            .into_iter()
            .map(|(lender, principal)| (lender, Entry { principal, accrual_start: terms.closing, carried: Cents::ZERO }))
            .collect();
        Ok(Books {
            paid_through: terms.closing,
            terms,
            roles,
            seq: 0,
            period: None,
            register,
            cash: BTreeMap::new(),
            requests: Vec::new(),
            trades: Vec::new(),
            dq: BTreeSet::new(),
            view_keys: BTreeMap::new(),
            blind: String::new(),
        })
    }

    /// The fingerprint published on chain after every command.
    pub fn root(&self) -> String {
        let bytes = serde_json::to_vec(self).expect("books serialize to JSON");
        crate::proofs::hex(&Sha256::digest(bytes))
    }

    pub fn outstanding(&self) -> Cents {
        self.register.values().map(|e| e.principal).sum()
    }

    pub fn cash_of(&self, party: &str) -> Cents {
        self.cash.get(party).copied().unwrap_or_default()
    }

    /// The all-in rate of the current period, in basis points.
    pub fn rate_bps(&self) -> Option<u32> {
        self.period.as_ref().map(|p| all_in_rate_bps(self.terms.margin_bps, p.base_rate_bps))
    }

    pub fn open_request(&self) -> Option<&Request> {
        self.requests.iter().find(|r| r.status == RequestStatus::Open)
    }

    fn apply(&mut self, caller: &str, command: Command) -> Result<Outcome, Refusal> {
        match command {
            Command::InitDeal { .. } => refuse("the deal is already set up"),
            Command::FixRate { base_rate_bps, period_end } => self.fix_rate(caller, base_rate_bps, period_end),
            Command::RequestInterest { expected_total } => self.request_interest(caller, expected_total),
            Command::Deposit { party, amount, purpose } => self.deposit(caller, party, amount, purpose),
            Command::Settle { request_id } => self.settle(caller, request_id),
            Command::SetDq { list } => self.set_dq(caller, list),
            Command::OfferTrade { buyer, par, price_ppm, trade_date } => {
                self.offer_trade(caller, buyer, par, price_ppm, trade_date)
            }
            Command::AcceptTrade { trade_id } => self.accept_trade(caller, trade_id),
            Command::SettleTrade { trade_id } => self.settle_trade(caller, trade_id),
            Command::Withdraw { amount } => self.withdraw(caller, amount),
            Command::RegisterViewKey { pubkey } => {
                self.view_keys.insert(caller.to_string(), pubkey);
                Ok(Outcome::public(json!({ "party": caller })))
            }
        }
    }

    fn only(&self, caller: &str, allowed: &str, what: &str) -> Result<(), Refusal> {
        if caller == allowed {
            Ok(())
        } else {
            refuse(format!("only {what}"))
        }
    }

    fn credit(&mut self, party: &str, amount: Cents) {
        if amount > Cents::ZERO {
            *self.cash.entry(party.to_string()).or_default() += amount;
        }
    }

    fn fix_rate(&mut self, caller: &str, base_rate_bps: u32, period_end: Date) -> Result<Outcome, Refusal> {
        self.only(caller, &self.roles.agent, "the agent can fix the rate")?;
        if self.period.is_some() {
            return refuse("the current period is still open");
        }
        if period_end <= self.paid_through || period_end > self.terms.maturity {
            return refuse("the period must end after the last one and by maturity");
        }
        self.period = Some(Period { start: self.paid_through, end: period_end, base_rate_bps });
        Ok(Outcome::public(json!({ "period_end": period_end, "rate_bps": self.rate_bps() })))
    }

    /// The agent types the total it expects to collect, as an operations desk
    /// would. If that is not what the register says, nothing is requested.
    fn request_interest(&mut self, caller: &str, expected_total: Cents) -> Result<Outcome, Refusal> {
        self.only(caller, &self.roles.agent, "the agent can request interest")?;
        let (Some(period), Some(rate_bps)) = (self.period.clone(), self.rate_bps()) else {
            return refuse("fix the rate for the period first");
        };
        if self.open_request().is_some() {
            return refuse("a request is already open");
        }
        let legs: BTreeMap<String, Cents> = self
            .register
            .iter()
            .map(|(lender, entry)| (lender.clone(), entry.interest_due(rate_bps, period.end)))
            .filter(|(_, due)| *due > Cents::ZERO)
            .collect();
        let total: Cents = legs.values().copied().sum();
        if expected_total != total {
            return refuse(format!("You entered {expected_total}; the register says {total}."));
        }
        let id = self.requests.len() as u64 + 1;
        self.requests.push(Request {
            id,
            period_end: period.end,
            legs,
            total,
            funded: Cents::ZERO,
            paid: BTreeMap::new(),
            status: RequestStatus::Open,
        });
        Ok(Outcome::public(json!({ "request_id": id, "total": total })))
    }

    /// Records cash the rules contract has already received. It cannot be
    /// refused, so money that does not fit a request becomes the payer's cash.
    fn deposit(&mut self, caller: &str, party: String, amount: Cents, purpose: Purpose) -> Result<Outcome, Refusal> {
        self.only(caller, &self.roles.ledger, "the rules contract can record a deposit")?;
        let mut to_request = Cents::ZERO;
        if let Purpose::Pay { request_id } = purpose {
            let borrower = party == self.roles.borrower;
            if let Some(request) = self.requests.iter_mut().find(|r| r.id == request_id && r.status == RequestStatus::Open) {
                if borrower {
                    let room = Cents(request.total.0 - request.funded.0);
                    to_request = amount.min(room);
                    request.funded += to_request;
                }
            }
        }
        let to_cash = Cents(amount.0 - to_request.0);
        self.credit(&party, to_cash);
        Ok(Outcome::public(json!({ "funded": to_request, "cash": to_cash })))
    }

    /// Pays every lender in one step. Fully funded: each lender gets its leg.
    /// Short: each lender gets the same fraction of its leg, and the rest stays
    /// owed. No lender is ever credited more than its leg, and the credits
    /// never add up to more than the borrower paid in.
    fn settle(&mut self, caller: &str, request_id: u64) -> Result<Outcome, Refusal> {
        self.only(caller, &self.roles.agent, "the agent can settle a payment")?;
        let Some(index) = self.requests.iter().position(|r| r.id == request_id && r.status == RequestStatus::Open) else {
            return refuse("there is no open request with that number");
        };
        let request = self.requests[index].clone();
        if request.funded == Cents::ZERO {
            return refuse("the borrower has not paid anything towards this request");
        }

        let mut paid = BTreeMap::new();
        for (lender, due) in &request.legs {
            let share = Cents(request.funded.0 * due.0 / request.total.0);
            let entry = self.register.get_mut(lender).expect("every leg belongs to a registered lender");
            entry.carried = Cents(due.0 - share.0);
            entry.accrual_start = request.period_end;
            paid.insert(lender.clone(), share);
        }
        let credited: Cents = paid.values().copied().sum();
        for (lender, share) in &paid {
            self.credit(lender, *share);
        }
        // Cents lost to rounding down go back to the borrower, not to a lender.
        let returned = Cents(request.funded.0 - credited.0);
        let borrower = self.roles.borrower.clone();
        self.credit(&borrower, returned);

        // A lender that sold everything leaves once its last interest is paid.
        self.register.retain(|_, e| e.principal > Cents::ZERO || e.carried > Cents::ZERO);
        self.paid_through = request.period_end;
        self.period = None;
        let done = &mut self.requests[index];
        done.paid = paid;
        done.status = RequestStatus::Settled;
        Ok(Outcome::public(json!({
            "request_id": request_id,
            "funded": request.funded,
            "credited": credited,
            "returned": returned,
        })))
    }

    fn set_dq(&mut self, caller: &str, list: BTreeSet<String>) -> Result<Outcome, Refusal> {
        self.only(caller, &self.roles.borrower, "the borrower can set the DQ list")?;
        self.dq = list;
        Ok(Outcome::public(json!({})))
    }

    fn offer_trade(&mut self, caller: &str, buyer: String, par: Cents, price_ppm: u32, trade_date: Date) -> Result<Outcome, Refusal> {
        let holds = self.register.get(caller).map(|e| e.principal).unwrap_or_default();
        if par == Cents::ZERO || holds < par || buyer == caller {
            return refuse("the offer does not match the seller's position");
        }
        let id = self.trades.len() as u64 + 1;
        self.trades.push(Trade {
            id,
            seller: caller.to_string(),
            buyer,
            par,
            price_ppm,
            trade_date,
            status: TradeStatus::Offered,
            screening: None,
        });
        Ok(Outcome::public(json!({ "trade_id": id })))
    }

    fn accept_trade(&mut self, caller: &str, trade_id: u64) -> Result<Outcome, Refusal> {
        match self.trades.iter_mut().find(|t| t.id == trade_id && t.status == TradeStatus::Offered && t.buyer == caller) {
            Some(trade) => {
                trade.status = TradeStatus::Accepted;
                Ok(Outcome::public(json!({ "trade_id": trade_id })))
            }
            None => refuse("there is no offer with that number for this buyer"),
        }
    }

    /// Cash against loan in one step, or nothing. A trade that fails screening
    /// or funding is marked not settled; the reason is kept for the agent only,
    /// so a refused buyer learns nothing about the DQ list.
    fn settle_trade(&mut self, caller: &str, trade_id: u64) -> Result<Outcome, Refusal> {
        self.only(caller, &self.roles.agent, "the agent can settle a trade")?;
        let Some(index) = self.trades.iter().position(|t| t.id == trade_id && t.status == TradeStatus::Accepted) else {
            return refuse("there is no accepted trade with that number");
        };
        let (Some(period), Some(rate_bps)) = (self.period.clone(), self.rate_bps()) else {
            return refuse("fix the rate for the period first");
        };
        if self.open_request().is_some() {
            return refuse("a payment is in progress; settle it first");
        }
        let trade = self.trades[index].clone();
        let cash = trade.cash();

        let blocked = if self.dq.contains(&trade.buyer) {
            Some("the buyer is on the DQ list")
        } else if trade.trade_date < period.start || trade.trade_date > period.end {
            Some("the trade date is outside the current period")
        } else if self.cash_of(&trade.buyer) < cash {
            Some("the buyer has not funded the cash leg")
        } else {
            match self.register.get(&trade.seller) {
                Some(e) if e.principal >= trade.par && e.accrual_start <= trade.trade_date => None,
                _ => Some("the seller no longer holds this position"),
            }
        };
        if let Some(reason) = blocked {
            let failed = &mut self.trades[index];
            failed.status = TradeStatus::NotSettled;
            failed.screening = Some(reason.to_string());
            return Ok(Outcome::public(json!({ "trade_id": trade_id, "settled": false })));
        }

        let seller = self.register.get_mut(&trade.seller).expect("checked above");
        seller.accrue_to(rate_bps, trade.trade_date);
        seller.principal = Cents(seller.principal.0 - trade.par.0);
        let buyer = self.register.entry(trade.buyer.clone()).or_insert(Entry {
            principal: Cents::ZERO,
            accrual_start: trade.trade_date,
            carried: Cents::ZERO,
        });
        buyer.accrue_to(rate_bps, trade.trade_date);
        buyer.principal += trade.par;

        let buyer_cash = self.cash.get_mut(&trade.buyer).expect("checked above");
        *buyer_cash = Cents(buyer_cash.0 - cash.0);
        self.credit(&trade.seller, cash);
        self.trades[index].status = TradeStatus::Settled;
        Ok(Outcome::public(json!({ "trade_id": trade_id, "settled": true })))
    }

    fn withdraw(&mut self, caller: &str, amount: Cents) -> Result<Outcome, Refusal> {
        let Some(left) = self.cash_of(caller).minus(amount).filter(|_| amount > Cents::ZERO) else {
            return refuse("you can withdraw up to your cash balance");
        };
        self.cash.insert(caller.to_string(), left);
        Ok(Outcome { public: json!({ "party": caller, "amount": amount }), payouts: vec![Payout { to: caller.to_string(), amount }] })
    }
}
