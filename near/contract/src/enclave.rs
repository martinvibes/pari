//! Talking to the enclave: sending a command to OutLayer and applying its
//! answer, with the contract's own money checks.

use crate::{events, ext_contract, Action, Envelope, Ledger, PublicRequest, EXECUTION_DEPOSIT, GAS_CALLBACK, GAS_OWN, UNITS_PER_CENT};
use near_sdk::json_types::U128;
use near_sdk::serde_json::{json, Value};
use near_sdk::{env, require, AccountId, Promise};

#[ext_contract(ext_outlayer)]
#[allow(dead_code)]
trait OutLayer {
    fn request_execution(
        &mut self,
        source: Value,
        resource_limits: Option<Value>,
        input_data: Option<String>,
        secrets_ref: Option<Value>,
        response_format: Option<String>,
        payer_account_id: Option<AccountId>,
        params: Option<Value>,
    );
}

impl Action {
    fn name(&self) -> &'static str {
        match self {
            Action::EnclaveKey => "enclave_key",
            Action::InitDeal => "init_deal",
            Action::Sync => "sync",
            Action::RegisterViewKey { .. } => "register_view_key",
            Action::FixRate => "fix_rate",
            Action::RequestInterest => "request_interest",
            Action::Deposit { .. } => "deposit",
            Action::Settle { .. } => "settle",
            Action::SetDq => "set_dq",
            Action::OfferTrade => "offer_trade",
            Action::AcceptTrade => "accept_trade",
            Action::SettleTrade => "settle_trade",
            Action::Withdraw { .. } => "withdraw",
        }
    }
}

/// Cents travel as decimal strings.
fn cents(value: &Value) -> Option<u128> {
    value.as_str()?.parse().ok()
}

impl Ledger {
    /// Takes the lock and asks OutLayer to run the pinned enclave build with
    /// this command. `caller` is the account the contract vouches for.
    pub(crate) fn call_enclave(&mut self, action: &Action, caller: AccountId, command: Value, sealed: Option<String>) -> Promise {
        require!(self.frozen.is_none(), "the deal is frozen");
        require!(self.in_flight.is_none(), "another action is in flight; try again in a moment");
        self.in_flight = Some(action.name().to_string());

        let input = json!({ "deal": self.deal_id, "caller": caller, "prev_root": self.root, "command": command, "sealed": sealed });
        let source = json!({ "Project": { "project_id": self.project_id, "version_key": self.version_key } });
        let limits = json!({ "max_instructions": 10_000_000_000u64, "max_memory_mb": 128, "max_execution_seconds": 60 });
        let gas = env::prepaid_gas().saturating_sub(env::used_gas()).saturating_sub(GAS_CALLBACK).saturating_sub(GAS_OWN);
        ext_outlayer::ext(self.outlayer.clone())
            .with_attached_deposit(EXECUTION_DEPOSIT)
            .with_static_gas(gas)
            .request_execution(
                source,
                Some(limits),
                Some(input.to_string()),
                None,
                Some("Json".into()),
                Some(env::current_account_id()),
                None,
            )
    }

    /// Releases the lock and applies the enclave's answer. Returns what the
    /// caller's transaction shows: `{ok: true, seq, root, public}` or
    /// `{ok: false, refused}`.
    pub(crate) fn finish(&mut self, action: &Action, caller: &AccountId, reply: Option<Value>) -> Value {
        self.in_flight = None;
        let name = action.name();
        let reply = reply.unwrap_or_else(|| json!({ "ok": false, "error": "the enclave did not answer; nothing changed" }));
        if reply["ok"] != true {
            let reason = reply["refused"].as_str().or(reply["error"].as_str()).unwrap_or("refused").to_string();
            events::emit("refused", json!({ "action": name, "caller": caller, "reason": reason }));
            return json!({ "ok": false, "refused": reason });
        }
        let public = reply["public"].clone();
        if *action == Action::EnclaveKey {
            self.enclave_key = public["pubkey"].as_str().map(String::from);
            return json!({ "ok": true, "public": public });
        }

        self.root = reply["root"].as_str().map(String::from);
        self.seq = reply["seq"].as_u64().unwrap_or(self.seq);
        if let Some(envelopes) = reply["envelopes"].as_object() {
            for (party, sealed) in envelopes {
                if let (Ok(party), Some(sealed)) = (party.parse::<AccountId>(), sealed.as_str()) {
                    self.envelopes.insert(party.clone(), Envelope { seq: self.seq, sealed: sealed.to_string() });
                    self.parties.insert(party);
                }
            }
        }
        if let Err(reason) = self.enforce(action, caller, &public, &reply["payouts"]) {
            events::emit("frozen", json!({ "action": name, "reason": reason }));
            self.frozen = Some(reason);
        }
        events::emit("action", json!({ "action": name, "caller": caller, "seq": self.seq, "root": self.root, "public": public }));
        json!({ "ok": true, "seq": self.seq, "root": self.root, "public": public })
    }

    /// The contract's own money rules, checked against what it has seen itself.
    /// An `Err` means the enclave answered something that must never happen.
    fn enforce(&mut self, action: &Action, caller: &AccountId, public: &Value, payouts: &Value) -> Result<(), String> {
        let payouts = payouts.as_array().map(Vec::as_slice).unwrap_or_default();
        if !matches!(action, Action::Withdraw { .. }) && !payouts.is_empty() {
            return Err("a payout came back from an action that pays nothing out".into());
        }
        match action {
            Action::RequestInterest => {
                let (Some(id), Some(total)) = (public["request_id"].as_u64(), cents(&public["total"])) else {
                    return Err("the request came back without a number or a total".into());
                };
                self.requests.insert(id, PublicRequest { total: U128(total), ..Default::default() });
            }
            Action::Deposit { amount, request_id } => {
                let paid_in = amount.0 / UNITS_PER_CENT;
                let (Some(funded), Some(cash)) = (cents(&public["funded"]), cents(&public["cash"])) else {
                    return Err("the deposit came back without amounts".into());
                };
                self.held += paid_in * UNITS_PER_CENT;
                if funded + cash != paid_in {
                    return Err("the books recorded a different amount than was paid in".into());
                }
                if funded > 0 {
                    let request = request_id.and_then(|id| self.requests.get_mut(&id)).ok_or("money was put towards an unknown request")?;
                    request.funded.0 += funded;
                    if request.funded.0 > request.total.0 {
                        return Err("a request was funded beyond its total".into());
                    }
                }
            }
            Action::Settle { request_id } => {
                let credited = cents(&public["credited"]).ok_or("the settlement came back without a credited amount")?;
                let request = self.requests.get_mut(request_id).ok_or("an unknown request was settled")?;
                request.credited = U128(credited);
                request.settled = true;
                // The Revlon rule: lenders never get more than the borrower paid in.
                if credited > request.funded.0 {
                    return Err("lenders were credited more than the borrower paid in".into());
                }
            }
            Action::Withdraw { amount } => {
                let [payout] = payouts else {
                    return Err("a withdrawal must come back as exactly one payout".into());
                };
                if payout["to"].as_str() != Some(caller.as_str()) || cents(&payout["amount"]) != Some(amount.0) {
                    return Err("the payout does not match the withdrawal that was asked for".into());
                }
                let units = amount.0 * UNITS_PER_CENT;
                // No payout can exceed what the contract holds for the deal.
                if units > self.held {
                    return Err("a payout exceeded the USDC held for the deal".into());
                }
                self.held -= units;
                self.pay_out(caller.clone(), units).detach();
            }
            _ => {}
        }
        Ok(())
    }
}
