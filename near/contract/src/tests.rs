//! The contract's own rules: roles, the lock, and the money caps that hold
//! whatever the enclave answers. Callbacks are called directly with the
//! answers an enclave could give, honest or not.

use crate::*;
use near_sdk::test_utils::{get_created_receipts, VMContextBuilder};
use near_sdk::{testing_env, mock::MockAction};

const LEDGER: &str = "ledger.paridesk.testnet";
const OWNER: &str = "paridesk.testnet";
const OUTLAYER: &str = "outlayer.testnet";
const USDC: &str = "usdc.paridesk.testnet";
const AGENT: &str = "agent.paridesk.testnet";
const BORROWER: &str = "northwind.paridesk.testnet";
const ALDER: &str = "alder.paridesk.testnet";
const RIVAL: &str = "rival.paridesk.testnet";

const TOTAL: u128 = 197_166_666; // 1,971,666.66 in cents

fn account(id: &str) -> AccountId {
    id.parse().unwrap()
}

/// Makes `caller` the account calling the contract, in a fresh call with its
/// own gas, as each transaction and callback has on chain.
fn as_caller(caller: &str) {
    let context = VMContextBuilder::new()
        .current_account_id(account(LEDGER))
        .predecessor_account_id(account(caller))
        .account_balance(NearToken::from_near(10))
        .prepaid_gas(Gas::from_tgas(300))
        .build();
    testing_env!(context);
}

fn ledger() -> Ledger {
    as_caller(LEDGER);
    let terms = Terms {
        facility_id: "NORTHWIND-TLB-2026".into(),
        name: "Northwind Logistics Term Loan B".into(),
        margin_bps: 350,
        closing: "2026-09-15".into(),
        maturity: "2031-09-15".into(),
    };
    Ledger::new(account(OWNER), "deal-1".into(), account(OUTLAYER), "paridesk.testnet/pari-core".into(), Some("abc123".into()), account(USDC), terms, account(AGENT), account(BORROWER))
}

/// An answer the enclave gives when a command is applied.
fn applied(seq: u64, public: Value, payouts: Value) -> Result<Option<Value>, PromiseError> {
    Ok(Some(json!({
        "ok": true,
        "root": format!("root-{seq}"),
        "seq": seq,
        "public": public,
        "payouts": payouts,
        "envelopes": { ALDER: format!("sealed-{seq}") },
        "commitments": { ALDER: format!("commitment-{seq}") },
    })))
}

/// A ledger with request 1 open for the full first-period interest.
fn with_open_request() -> Ledger {
    let mut ledger = ledger();
    as_caller(AGENT);
    ledger.request_interest(U128(TOTAL)).detach();
    as_caller(LEDGER);
    ledger.on_result(Action::RequestInterest, account(AGENT), applied(1, json!({ "request_id": 1, "total": TOTAL.to_string() }), json!([])));
    ledger
}

/// The borrower pays `cents` towards request 1 and the enclave records it.
fn borrower_pays(ledger: &mut Ledger, seq: u64, cents: u128) -> U128 {
    as_caller(USDC);
    let amount = U128(cents * UNITS_PER_CENT);
    let _ = ledger.ft_on_transfer(account(BORROWER), amount, r#"{"kind":"pay","request_id":1}"#.into());
    let action = Action::Deposit { payer: account(BORROWER), amount, request_id: Some(1) };
    as_caller(LEDGER);
    ledger.on_deposit_result(action, applied(seq, json!({ "funded": cents.to_string(), "cash": "0" }), json!([])))
}

/// The method names and JSON arguments of the calls the contract has scheduled.
fn calls() -> Vec<(String, String)> {
    get_created_receipts()
        .into_iter()
        .flat_map(|receipt| receipt.actions)
        .filter_map(|action| match action {
            MockAction::FunctionCallWeight { method_name, args, .. } => {
                Some((String::from_utf8(method_name).unwrap(), String::from_utf8(args).unwrap()))
            }
            _ => None,
        })
        .collect()
}

// ----- roles -----

#[test]
#[should_panic(expected = "only the agent can fix the rate")]
fn test_only_the_agent_fixes_the_rate() {
    let mut ledger = ledger();
    as_caller(RIVAL);
    ledger.fix_rate(430, "2026-12-15".into()).detach();
}

#[test]
#[should_panic(expected = "only the agent can request interest")]
fn test_the_borrower_cannot_request_interest() {
    let mut ledger = ledger();
    as_caller(BORROWER);
    ledger.request_interest(U128(TOTAL)).detach();
}

#[test]
#[should_panic(expected = "only the agent can settle a payment")]
fn test_a_lender_cannot_settle_a_payment() {
    let mut ledger = with_open_request();
    as_caller(ALDER);
    ledger.settle(1).detach();
}

#[test]
#[should_panic(expected = "only the borrower can set the DQ list")]
fn test_the_agent_cannot_set_the_dq_list() {
    let mut ledger = ledger();
    as_caller(AGENT);
    ledger.set_dq("sealed".into()).detach();
}

#[test]
#[should_panic(expected = "the owner sets the deal up")]
fn test_only_the_owner_sets_the_deal_up() {
    let mut ledger = ledger();
    as_caller(AGENT);
    ledger.init_deal(account(RIVAL), "sealed".into()).detach();
}

#[test]
fn test_the_contract_vouches_for_the_caller_and_pins_the_enclave_build() {
    let mut ledger = ledger();
    as_caller(ALDER);
    ledger.offer_trade("c2VhbGVk".into()).detach();

    let (method, args) = calls().into_iter().find(|(m, _)| m == "request_execution").expect("a call to OutLayer");
    assert_eq!(method, "request_execution");
    let args: Value = near_sdk::serde_json::from_str(&args).unwrap();
    assert_eq!(args["source"]["Project"], json!({ "project_id": "paridesk.testnet/pari-core", "version_key": "abc123" }));
    let input: Value = near_sdk::serde_json::from_str(args["input_data"].as_str().unwrap()).unwrap();
    let sent = json!({ "deal": "deal-1", "caller": ALDER, "prev_root": null, "turn": 0, "command": { "cmd": "offer_trade" }, "sealed": "c2VhbGVk" });
    assert_eq!(input, sent);
}

#[test]
fn test_storage_left_by_an_ended_deal_can_be_swept() {
    let mut ledger = ledger();
    as_caller(LEDGER);
    env::storage_write(b"deal-0/envelopes-alder", b"sealed");
    ledger.sweep(vec![b"deal-0/envelopes-alder".to_vec().into()]);
    assert!(!env::storage_has_key(b"deal-0/envelopes-alder"));
}

#[test]
#[should_panic(expected = "that key belongs to the current deal")]
fn test_the_current_deal_cannot_be_swept() {
    let mut ledger = ledger();
    as_caller(LEDGER);
    ledger.sweep(vec![b"deal-1/history".to_vec().into()]);
}

#[test]
#[should_panic(expected = "that key belongs to the current deal")]
fn test_the_contract_s_own_state_cannot_be_swept() {
    let mut ledger = ledger();
    as_caller(LEDGER);
    ledger.sweep(vec![b"STATE".to_vec().into()]);
}

// ----- the lock -----

#[test]
#[should_panic(expected = "another action is in flight")]
fn test_one_action_at_a_time() {
    let mut ledger = ledger();
    as_caller(AGENT);
    ledger.fix_rate(430, "2026-12-15".into()).detach();
    as_caller(AGENT);
    ledger.request_interest(U128(TOTAL)).detach();
}

#[test]
fn test_the_lock_is_released_on_refusal_and_on_failure() {
    let mut ledger = ledger();
    as_caller(AGENT);

    ledger.request_interest(U128(90_000_000_000)).detach();
    assert_eq!(ledger.state()["in_flight"], "request_interest");
    let refused = Ok(Some(json!({ "ok": false, "refused": "You entered 900,000,000.00; the register says 1,971,666.66.", "root": null })));
    as_caller(LEDGER);
    let outcome = ledger.on_result(Action::RequestInterest, account(AGENT), refused);
    assert_eq!(outcome, json!({ "ok": false, "refused": "You entered 900,000,000.00; the register says 1,971,666.66." }));
    assert_eq!(ledger.state()["in_flight"], Value::Null);
    assert_eq!(ledger.state()["requests"], json!({}));

    // The run failed or timed out: OutLayer answers null.
    as_caller(AGENT);
    ledger.request_interest(U128(TOTAL)).detach();
    as_caller(LEDGER);
    let outcome = ledger.on_result(Action::RequestInterest, account(AGENT), Ok(None));
    assert_eq!(outcome["ok"], false);
    assert_eq!(ledger.state()["in_flight"], Value::Null);

    // The promise itself failed.
    as_caller(AGENT);
    ledger.request_interest(U128(TOTAL)).detach();
    as_caller(LEDGER);
    ledger.on_result(Action::RequestInterest, account(AGENT), Err(PromiseError::Failed));
    assert_eq!(ledger.state()["in_flight"], Value::Null);
    assert_eq!(ledger.state()["root"], Value::Null);
}

/// What the contract last sent the enclave.
fn sent() -> Value {
    let (_, args) = calls().into_iter().find(|(m, _)| m == "request_execution").expect("a call to OutLayer");
    let args: Value = near_sdk::serde_json::from_str(&args).unwrap();
    near_sdk::serde_json::from_str(args["input_data"].as_str().unwrap()).unwrap()
}

#[test]
fn test_an_unanswered_request_changes_nothing_and_the_next_is_numbered_after_it() {
    let mut ledger = with_open_request();
    as_caller(AGENT);
    ledger.settle(1).detach();
    let first = sent();

    // NEAR stopped waiting: the callback runs with no answer.
    as_caller(LEDGER);
    let outcome = ledger.on_result(Action::Settle { request_id: 1 }, account(AGENT), Ok(None));
    assert_eq!(outcome, json!({ "ok": false, "refused": "the enclave did not answer; nothing changed" }));
    assert_eq!(ledger.state()["root"], "root-1");
    assert_eq!(ledger.state()["requests"]["1"]["settled"], false);

    // The next request names the same books and a higher number, so the
    // enclave builds on what this contract holds and drops a late answer.
    as_caller(AGENT);
    ledger.settle(1).detach();
    let second = sent();
    assert_eq!(second["prev_root"], "root-1");
    assert_eq!(second["prev_root"], first["prev_root"]);
    assert_eq!(second["turn"].as_u64(), first["turn"].as_u64().map(|turn| turn + 1));
}

// ----- applying an answer -----

#[test]
fn test_the_callback_applies_the_root_and_the_envelopes() {
    let mut ledger = with_open_request();
    let state = ledger.state();
    assert_eq!((state["root"].as_str(), state["seq"].as_u64()), (Some("root-1"), Some(1)));
    assert_eq!(state["requests"]["1"], json!({ "total": TOTAL.to_string(), "funded": "0", "credited": "0", "settled": false }));
    let envelope = ledger.envelope(account(ALDER)).expect("an envelope for Alder");
    assert_eq!((envelope.seq, envelope.sealed.as_str(), envelope.commitment.as_str()), (1, "sealed-1", "commitment-1"));
    assert!(ledger.envelope(account(RIVAL)).is_none());

    // The next command carries the fingerprint, so the enclave can refuse a stale one.
    as_caller(AGENT);
    ledger.settle(1).detach();
    let (_, args) = calls().into_iter().find(|(m, _)| m == "request_execution").unwrap();
    assert!(args.contains(r#"\"prev_root\":\"root-1\""#));
}

#[test]
fn test_the_public_record_lists_every_action_and_refusal() {
    let mut ledger = ledger();
    as_caller(AGENT);
    ledger.request_interest(U128(90_000_000_000)).detach();
    let refusal = "You entered 900,000,000.00; the register says 1,971,666.66.";
    as_caller(LEDGER);
    ledger.on_result(Action::RequestInterest, account(AGENT), Ok(Some(json!({ "ok": false, "refused": refusal, "root": null }))));
    as_caller(AGENT);
    ledger.request_interest(U128(TOTAL)).detach();
    as_caller(LEDGER);
    ledger.on_result(Action::RequestInterest, account(AGENT), applied(1, json!({ "request_id": 1, "total": TOTAL.to_string() }), json!([])));
    borrower_pays(&mut ledger, 2, TOTAL);

    let lines: Vec<_> = ledger.history(None, None).into_iter().map(|r| (r.seq, r.action.as_str(), r.caller.as_str(), r.ok, r.detail.as_str())).collect();
    assert_eq!(
        lines,
        [
            (0, "request_interest", AGENT, false, refusal),
            (1, "request_interest", AGENT, true, r#"{"request_id":1,"total":"197166666"}"#),
            (2, "deposit", BORROWER, true, r#"{"funded":"197166666","cash":"0"}"#),
        ]
    );
    assert_eq!(ledger.state()["history_len"], 3);
    assert_eq!(ledger.history(Some(2), Some(5)).len(), 1);
}

#[test]
fn test_a_view_key_is_published_once_the_enclave_accepts_it() {
    let mut ledger = ledger();
    as_caller(ALDER);
    ledger.register_view_key("a2V5".into()).detach();
    assert!(ledger.view_key(account(ALDER)).is_none());
    as_caller(LEDGER);
    ledger.on_result(Action::RegisterViewKey { pubkey: "a2V5".into() }, account(ALDER), applied(1, json!({ "party": ALDER }), json!([])));
    assert_eq!(ledger.view_key(account(ALDER)).map(String::as_str), Some("a2V5"));
}

// ----- the Revlon rules, held by the contract alone -----

#[test]
fn test_a_full_payment_settles_and_is_recorded() {
    let mut ledger = with_open_request();
    assert_eq!(borrower_pays(&mut ledger, 2, TOTAL), U128(0));
    as_caller(AGENT);
    ledger.settle(1).detach();
    let public = json!({ "request_id": 1, "funded": TOTAL.to_string(), "credited": TOTAL.to_string(), "returned": "0" });
    as_caller(LEDGER);
    ledger.on_result(Action::Settle { request_id: 1 }, account(AGENT), applied(3, public, json!([])));

    let state = ledger.state();
    assert_eq!(state["frozen"], Value::Null);
    assert_eq!(state["held"], (TOTAL * UNITS_PER_CENT).to_string());
    assert_eq!(state["requests"]["1"]["credited"], TOTAL.to_string());
    assert_eq!(state["requests"]["1"]["settled"], true);
}

#[test]
fn test_lenders_cannot_be_credited_more_than_the_borrower_paid_in() {
    let mut ledger = with_open_request();
    borrower_pays(&mut ledger, 2, TOTAL / 2);
    as_caller(AGENT);
    ledger.settle(1).detach();

    // The enclave claims it credited the full total against half the money.
    let public = json!({ "request_id": 1, "funded": TOTAL.to_string(), "credited": TOTAL.to_string(), "returned": "0" });
    as_caller(LEDGER);
    ledger.on_result(Action::Settle { request_id: 1 }, account(AGENT), applied(3, public, json!([])));

    assert_eq!(ledger.state()["frozen"], "lenders were credited more than the borrower paid in");
}

#[test]
fn test_a_payout_cannot_exceed_the_usdc_held() {
    let mut ledger = with_open_request();
    borrower_pays(&mut ledger, 2, TOTAL);
    as_caller(ALDER);
    let amount = U128(90_000_000_000); // $900,000,000.00
    ledger.withdraw(amount).detach();

    // The enclave agrees to pay out $900m. The contract holds $1.97m.
    let payouts = json!([{ "to": ALDER, "amount": "90000000000" }]);
    as_caller(LEDGER);
    ledger.on_result(Action::Withdraw { amount }, account(ALDER), applied(3, json!({}), payouts));

    assert_eq!(ledger.state()["frozen"], "a payout exceeded the USDC held for the deal");
    assert_eq!(ledger.state()["held"], (TOTAL * UNITS_PER_CENT).to_string());
    assert!(calls().iter().all(|(method, _)| method != "ft_transfer"));
}

#[test]
fn test_a_payout_goes_only_to_the_party_that_asked() {
    let mut ledger = with_open_request();
    borrower_pays(&mut ledger, 2, TOTAL);
    as_caller(ALDER);
    let amount = U128(98_583_333);
    ledger.withdraw(amount).detach();

    let payouts = json!([{ "to": RIVAL, "amount": "98583333" }]);
    as_caller(LEDGER);
    ledger.on_result(Action::Withdraw { amount }, account(ALDER), applied(3, json!({}), payouts));

    assert_eq!(ledger.state()["frozen"], "the payout does not match the withdrawal that was asked for");
    assert!(calls().iter().all(|(method, _)| method != "ft_transfer"));
}

#[test]
fn test_only_a_withdrawal_pays_out() {
    let mut ledger = with_open_request();
    borrower_pays(&mut ledger, 2, TOTAL);
    as_caller(AGENT);
    ledger.settle(1).detach();

    let public = json!({ "request_id": 1, "funded": TOTAL.to_string(), "credited": TOTAL.to_string(), "returned": "0" });
    let payouts = json!([{ "to": AGENT, "amount": "100" }]);
    as_caller(LEDGER);
    ledger.on_result(Action::Settle { request_id: 1 }, account(AGENT), applied(3, public, payouts));

    assert_eq!(ledger.state()["frozen"], "a payout came back from an action that pays nothing out");
}

#[test]
fn test_a_withdrawal_within_the_cap_is_paid_in_usdc() {
    let mut ledger = with_open_request();
    borrower_pays(&mut ledger, 2, TOTAL);
    as_caller(ALDER);
    let amount = U128(98_583_333); // 985,833.33
    ledger.withdraw(amount).detach();
    let payouts = json!([{ "to": ALDER, "amount": "98583333" }]);
    as_caller(LEDGER);
    ledger.on_result(Action::Withdraw { amount }, account(ALDER), applied(3, json!({}), payouts));

    assert_eq!(ledger.state()["frozen"], Value::Null);
    assert_eq!(ledger.state()["held"], ((TOTAL - 98_583_333) * UNITS_PER_CENT).to_string());
    let (_, args) = calls().into_iter().find(|(method, _)| method == "ft_transfer").expect("a USDC transfer");
    assert_eq!(near_sdk::serde_json::from_str::<Value>(&args).unwrap(), json!({ "receiver_id": ALDER, "amount": "985833330000", "memo": null }));

    // If the transfer fails, the amount stays owed to the party.
    as_caller(LEDGER);
    ledger.on_payout(account(ALDER), U128(985_833_330_000), Err(PromiseError::Failed));
    assert_eq!(ledger.owed(account(ALDER)), U128(985_833_330_000));
}

#[test]
#[should_panic(expected = "the deal is frozen")]
fn test_nothing_runs_once_frozen() {
    let mut ledger = with_open_request();
    as_caller(AGENT);
    ledger.settle(1).detach();
    let public = json!({ "request_id": 1, "funded": "0", "credited": "1", "returned": "0" });
    as_caller(LEDGER);
    ledger.on_result(Action::Settle { request_id: 1 }, account(AGENT), applied(2, public, json!([])));
    as_caller(AGENT);
    ledger.fix_rate(430, "2027-03-15".into()).detach();
}

// ----- money in -----

#[test]
#[should_panic(expected = "only the deal's USDC is accepted")]
fn test_a_transfer_from_another_token_is_rejected() {
    let mut ledger = with_open_request();
    as_caller("fake-usdc.testnet");
    let _ = ledger.ft_on_transfer(account(BORROWER), U128(1_000_000), r#"{"kind":"pay","request_id":1}"#.into());
}

#[test]
#[should_panic(expected = "only the borrower pays a request")]
fn test_only_the_borrower_pays_a_request() {
    let mut ledger = with_open_request();
    as_caller(USDC);
    let _ = ledger.ft_on_transfer(account(RIVAL), U128(1_000_000), r#"{"kind":"pay","request_id":1}"#.into());
}

#[test]
fn test_a_deposit_keeps_whole_cents_and_a_failed_one_is_returned_in_full() {
    let mut ledger = with_open_request();
    as_caller(USDC);

    // 12.345678 USDC: 1,234 cents are kept, 5,678 base units go back.
    let amount = U128(12_345_678);
    let _ = ledger.ft_on_transfer(account(RIVAL), amount, r#"{"kind":"cash"}"#.into());
    let action = Action::Deposit { payer: account(RIVAL), amount, request_id: None };
    as_caller(LEDGER);
    let unused = ledger.on_deposit_result(action.clone(), applied(2, json!({ "funded": "0", "cash": "1234" }), json!([])));
    assert_eq!(unused, U128(5_678));
    assert_eq!(ledger.state()["held"], "12340000");

    // The enclave did not answer: everything goes back and nothing is held.
    as_caller(USDC);
    let _ = ledger.ft_on_transfer(account(RIVAL), amount, r#"{"kind":"cash"}"#.into());
    as_caller(LEDGER);
    assert_eq!(ledger.on_deposit_result(action, Ok(None)), amount);
    assert_eq!(ledger.state()["held"], "12340000");
    assert_eq!(ledger.state()["in_flight"], Value::Null);
}

#[test]
fn test_the_books_must_record_exactly_what_was_paid_in() {
    let mut ledger = with_open_request();
    as_caller(USDC);
    let amount = U128(1_000 * UNITS_PER_CENT);
    let _ = ledger.ft_on_transfer(account(BORROWER), amount, r#"{"kind":"pay","request_id":1}"#.into());
    let action = Action::Deposit { payer: account(BORROWER), amount, request_id: Some(1) };
    as_caller(LEDGER);
    ledger.on_deposit_result(action, applied(2, json!({ "funded": "900000", "cash": "0" }), json!([])));
    assert_eq!(ledger.state()["frozen"], "the books recorded a different amount than was paid in");
}
