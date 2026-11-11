//! Pari's rules contract ("the ledger").
//!
//! The loan's books are private and live in an OutLayer enclave. This contract
//! is the only thing that can run that enclave. For every action it checks the
//! caller's public role, takes a lock, calls the enclave, and applies the
//! answer in a callback: a new fingerprint of the books, one sealed envelope
//! per party, and public facts such as a request's total.
//!
//! The contract also guards the money on its own, without trusting the
//! enclave: lenders are never credited more than the borrower paid in for a
//! request, and no payout can exceed the USDC the contract holds for the deal.
//! If the enclave ever answers otherwise, the deal freezes.

// OutLayer's `request_execution` takes seven arguments, and so does setting a deal up.
#![allow(clippy::too_many_arguments)]

mod enclave;
mod events;
#[cfg(test)]
mod tests;

use near_sdk::json_types::U128;
use near_sdk::serde_json::{json, Value};
use near_sdk::store::{LookupMap, Vector};
use near_sdk::{env, ext_contract, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError, PromiseOrValue};
use std::collections::{BTreeMap, BTreeSet};

/// The books keep cents; test USDC has 6 decimals.
const UNITS_PER_CENT: u128 = 10_000;
/// Paid to OutLayer from the contract's own balance for each run. OutLayer
/// refunds what the run does not use.
const EXECUTION_DEPOSIT: NearToken = NearToken::from_millinear(10);
const GAS_OWN: Gas = Gas::from_tgas(30);
const GAS_CALLBACK: Gas = Gas::from_tgas(70);
const GAS_FT_TRANSFER: Gas = Gas::from_tgas(15);
const GAS_PAYOUT_CALLBACK: Gas = Gas::from_tgas(8);

#[ext_contract(ext_ft)]
#[allow(dead_code)]
trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

/// The public terms of the facility.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Terms {
    pub facility_id: String,
    pub name: String,
    pub margin_bps: u32,
    /// Deal dates are written `YYYY-MM-DD`.
    pub closing: String,
    pub maturity: String,
}

/// The public side of an interest request: totals only, never a lender's leg.
#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct PublicRequest {
    /// Cents the agent asked the borrower for.
    pub total: U128,
    /// Cents the borrower has paid in.
    pub funded: U128,
    /// Cents credited to lenders at settlement.
    pub credited: U128,
    pub settled: bool,
}

/// One party's view of the books, sealed to that party's key.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Envelope {
    pub seq: u64,
    pub sealed: String,
}

/// One line of the deal's public record: who did what, and what the chain
/// learned from it.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Record {
    /// The books' sequence number after the action. A refusal leaves it unchanged.
    pub seq: u64,
    /// Block time, in milliseconds.
    pub at_ms: u64,
    pub action: String,
    pub caller: AccountId,
    pub ok: bool,
    /// What the action made public, as JSON, or why it was refused.
    pub detail: String,
}

/// What a callback needs to remember about the action it finishes.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Action {
    EnclaveKey,
    InitDeal,
    Sync,
    RegisterViewKey { pubkey: String },
    FixRate,
    RequestInterest,
    /// `amount` is in USDC base units.
    Deposit { payer: AccountId, amount: U128, request_id: Option<u64> },
    Settle { request_id: u64 },
    SetDq,
    OfferTrade,
    AcceptTrade,
    SettleTrade,
    /// `amount` is in cents.
    Withdraw { amount: U128 },
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Ledger {
    /// Sets the deal up. Cannot move money or act for any party.
    owner: AccountId,
    /// Names this deal's books inside the enclave.
    deal_id: String,
    outlayer: AccountId,
    /// The enclave program, `owner/name` on OutLayer.
    project_id: String,
    /// The sha256 of the one enclave build this contract will run.
    version_key: Option<String>,
    usdc: AccountId,
    terms: Terms,
    agent: AccountId,
    borrower: AccountId,
    /// The key parties seal their secrets to. Only the enclave holds its other half.
    enclave_key: Option<String>,
    /// Fingerprint (sha256) of the books after the last action.
    root: Option<String>,
    seq: u64,
    /// The action waiting for the enclave, if any. One at a time.
    in_flight: Option<String>,
    /// Set when the enclave's answer broke a money rule. Nothing runs after.
    frozen: Option<String>,
    requests: BTreeMap<u64, PublicRequest>,
    /// USDC base units held for the deal: everything paid in, less payouts.
    held: u128,
    /// Accounts that have an envelope.
    parties: BTreeSet<AccountId>,
    envelopes: LookupMap<AccountId, Envelope>,
    view_keys: LookupMap<AccountId, String>,
    /// Payouts whose transfer failed, waiting for `claim`.
    owed: LookupMap<AccountId, u128>,
    /// Every action and refusal, in order. Public facts only.
    history: Vector<Record>,
}

#[near]
impl Ledger {
    /// Starts a deal. Only the contract's own key can call this, and that key
    /// could redeploy the contract anyway. A new `deal_id` starts fresh books.
    #[init(ignore_state)]
    #[private]
    pub fn new(
        owner: AccountId,
        deal_id: String,
        outlayer: AccountId,
        project_id: String,
        version_key: Option<String>,
        usdc: AccountId,
        terms: Terms,
        agent: AccountId,
        borrower: AccountId,
    ) -> Self {
        Self {
            envelopes: LookupMap::new(format!("{deal_id}/envelopes").into_bytes()),
            view_keys: LookupMap::new(format!("{deal_id}/view_keys").into_bytes()),
            owed: LookupMap::new(format!("{deal_id}/owed").into_bytes()),
            history: Vector::new(format!("{deal_id}/history").into_bytes()),
            owner,
            deal_id,
            outlayer,
            project_id,
            version_key,
            usdc,
            terms,
            agent,
            borrower,
            enclave_key: None,
            root: None,
            seq: 0,
            in_flight: None,
            frozen: None,
            requests: BTreeMap::new(),
            held: 0,
            parties: BTreeSet::new(),
        }
    }

    // ----- setup (owner) -----

    /// Publishes the key that parties seal their secrets to.
    pub fn fetch_enclave_key(&mut self) -> Promise {
        let caller = env::predecessor_account_id();
        self.run(Action::EnclaveKey, caller, json!({ "cmd": "pubkey" }), None)
    }

    /// Loads the closed deal. `sealed` holds each lender's opening position,
    /// sealed to the enclave.
    pub fn init_deal(&mut self, auditor: AccountId, sealed: String) -> Promise {
        self.only(&self.owner, "the owner sets the deal up");
        let command = json!({
            "cmd": "init_deal",
            "terms": self.terms,
            "agent": self.agent,
            "borrower": self.borrower,
            "auditor": auditor,
        });
        self.run(Action::InitDeal, env::current_account_id(), command, Some(sealed))
    }

    /// Re-reads the fingerprint and envelopes from the enclave, in case a
    /// callback was lost after the books had moved.
    pub fn sync(&mut self) -> Promise {
        self.only(&self.owner, "the owner syncs");
        self.run(Action::Sync, env::current_account_id(), json!({ "cmd": "sync" }), None)
    }

    /// Releases a lock left by a callback that never ran.
    pub fn unlock(&mut self) {
        self.only(&self.owner, "the owner unlocks");
        self.in_flight = None;
    }

    // ----- the agent -----

    pub fn fix_rate(&mut self, base_rate_bps: u32, period_end: String) -> Promise {
        self.only(&self.agent, "only the agent can fix the rate");
        let command = json!({ "cmd": "fix_rate", "base_rate_bps": base_rate_bps, "period_end": period_end });
        self.run(Action::FixRate, env::predecessor_account_id(), command, None)
    }

    /// The agent types the total it expects, in cents. The enclave refuses
    /// unless it equals what the register says.
    pub fn request_interest(&mut self, expected_total: U128) -> Promise {
        self.only(&self.agent, "only the agent can request interest");
        let command = json!({ "cmd": "request_interest", "expected_total": expected_total });
        self.run(Action::RequestInterest, env::predecessor_account_id(), command, None)
    }

    pub fn settle(&mut self, request_id: u64) -> Promise {
        self.only(&self.agent, "only the agent can settle a payment");
        let command = json!({ "cmd": "settle", "request_id": request_id });
        self.run(Action::Settle { request_id }, env::predecessor_account_id(), command, None)
    }

    pub fn settle_trade(&mut self, trade_id: u64) -> Promise {
        self.only(&self.agent, "only the agent can settle a trade");
        let command = json!({ "cmd": "settle_trade", "trade_id": trade_id });
        self.run(Action::SettleTrade, env::predecessor_account_id(), command, None)
    }

    // ----- the borrower -----

    /// `sealed` holds the list of buyers who may not buy into the loan.
    pub fn set_dq(&mut self, sealed: String) -> Promise {
        self.only(&self.borrower, "only the borrower can set the DQ list");
        self.run(Action::SetDq, env::predecessor_account_id(), json!({ "cmd": "set_dq" }), Some(sealed))
    }

    // ----- any party, acting for itself -----
    // The enclave decides whether the caller is entitled; the contract only
    // vouches for who called.

    /// Registers the key the caller's envelopes are sealed to.
    pub fn register_view_key(&mut self, pubkey: String) -> Promise {
        let command = json!({ "cmd": "register_view_key", "pubkey": pubkey });
        self.run(Action::RegisterViewKey { pubkey }, env::predecessor_account_id(), command, None)
    }

    /// `sealed` holds the buyer, par, price and trade date.
    pub fn offer_trade(&mut self, sealed: String) -> Promise {
        self.run(Action::OfferTrade, env::predecessor_account_id(), json!({ "cmd": "offer_trade" }), Some(sealed))
    }

    pub fn accept_trade(&mut self, trade_id: u64) -> Promise {
        let command = json!({ "cmd": "accept_trade", "trade_id": trade_id });
        self.run(Action::AcceptTrade, env::predecessor_account_id(), command, None)
    }

    /// Takes `amount` cents of the caller's cash out of the deal as USDC.
    pub fn withdraw(&mut self, amount: U128) -> Promise {
        let command = json!({ "cmd": "withdraw", "amount": amount });
        self.run(Action::Withdraw { amount }, env::predecessor_account_id(), command, None)
    }

    /// Retries a payout whose USDC transfer failed.
    pub fn claim(&mut self) -> Promise {
        require!(self.frozen.is_none(), "the deal is frozen");
        let to = env::predecessor_account_id();
        let amount = self.owed.remove(&to).unwrap_or(0);
        require!(amount > 0, "nothing is owed to you");
        self.pay_out(to, amount)
    }

    // ----- money in -----

    /// USDC arriving by `ft_transfer_call`. `msg` is `{"kind":"cash"}` to hold
    /// cash in the books, or `{"kind":"pay","request_id":N}` for the borrower
    /// paying a request. Returns what was not used; a failed run returns it all.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        require!(env::predecessor_account_id() == self.usdc, "only the deal's USDC is accepted");
        let purpose: Value = near_sdk::serde_json::from_str(&msg).unwrap_or(Value::Null);
        let request_id = match purpose["kind"].as_str() {
            Some("cash") => None,
            Some("pay") => {
                require!(sender_id == self.borrower, "only the borrower pays a request");
                let id = purpose["request_id"].as_u64().unwrap_or_else(|| env::panic_str("pay needs a request_id"));
                require!(self.requests.get(&id).is_some_and(|r| !r.settled), "there is no open request with that number");
                Some(id)
            }
            _ => env::panic_str(r#"msg must be {"kind":"cash"} or {"kind":"pay","request_id":N}"#),
        };
        let cents = amount.0 / UNITS_PER_CENT;
        require!(cents > 0, "less than one cent");
        let command = json!({ "cmd": "deposit", "party": sender_id, "amount": cents.to_string(), "purpose": purpose });
        let action = Action::Deposit { payer: sender_id, amount, request_id };
        let finish = Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK).on_deposit_result(action.clone());
        self.call_enclave(&action, env::current_account_id(), command, None).then(finish).into()
    }

    // ----- callbacks -----

    #[private]
    pub fn on_result(&mut self, action: Action, caller: AccountId, #[callback_result] result: Result<Option<Value>, PromiseError>) -> Value {
        self.finish(&action, &caller, result.ok().flatten())
    }

    #[private]
    pub fn on_deposit_result(&mut self, action: Action, #[callback_result] result: Result<Option<Value>, PromiseError>) -> U128 {
        let Action::Deposit { amount, .. } = action else { env::panic_str("not a deposit") };
        let outcome = self.finish(&action, &env::current_account_id(), result.ok().flatten());
        if outcome["ok"] == true {
            U128(amount.0 % UNITS_PER_CENT)
        } else {
            amount
        }
    }

    #[private]
    pub fn on_payout(&mut self, to: AccountId, amount: U128, #[callback_result] result: Result<(), PromiseError>) {
        if result.is_err() {
            let owed = self.owed.get(&to).copied().unwrap_or(0);
            self.owed.insert(to.clone(), owed + amount.0);
            events::emit("payout_failed", json!({ "to": to, "amount": amount }));
        } else {
            events::emit("payout", json!({ "to": to, "amount": amount }));
        }
    }

    // ----- public reads -----

    /// Everything the public chain knows about the deal.
    pub fn state(&self) -> Value {
        json!({
            "deal_id": self.deal_id,
            "owner": self.owner,
            "terms": self.terms,
            "agent": self.agent,
            "borrower": self.borrower,
            "usdc": self.usdc,
            "outlayer": self.outlayer,
            "project_id": self.project_id,
            "version_key": self.version_key,
            "enclave_key": self.enclave_key,
            "root": self.root,
            "seq": self.seq,
            "in_flight": self.in_flight,
            "frozen": self.frozen,
            "held": U128(self.held),
            "requests": self.requests,
            "parties": self.parties,
            "history_len": self.history.len(),
        })
    }

    /// The deal's public record, oldest first.
    pub fn history(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<&Record> {
        self.history.iter().skip(from_index.unwrap_or(0) as usize).take(limit.unwrap_or(100) as usize).collect()
    }

    /// A party's latest envelope. Anyone can read it; only the party can open it.
    pub fn envelope(&self, account_id: AccountId) -> Option<&Envelope> {
        self.envelopes.get(&account_id)
    }

    pub fn view_key(&self, account_id: AccountId) -> Option<&String> {
        self.view_keys.get(&account_id)
    }

    pub fn owed(&self, account_id: AccountId) -> U128 {
        U128(self.owed.get(&account_id).copied().unwrap_or(0))
    }
}

impl Ledger {
    fn only(&self, allowed: &AccountId, rule: &str) {
        require!(&env::predecessor_account_id() == allowed, rule);
    }

    /// Calls the enclave and finishes in `on_result`.
    fn run(&mut self, action: Action, caller: AccountId, command: Value, sealed: Option<String>) -> Promise {
        let finish = Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK).on_result(action.clone(), caller.clone());
        self.call_enclave(&action, caller, command, sealed).then(finish)
    }

    fn pay_out(&mut self, to: AccountId, amount: u128) -> Promise {
        ext_ft::ext(self.usdc.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(to.clone(), U128(amount), None)
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_PAYOUT_CALLBACK).on_payout(to, U128(amount)))
    }
}
