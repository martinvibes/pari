//! NEP-297 events. They carry public facts only: which action ran, who called
//! it, totals and fingerprints. Never a position, a lender's payment or a price.

use near_sdk::env;
use near_sdk::serde_json::{json, Value};

pub fn emit(event: &str, data: Value) {
    let body = json!({ "standard": "pari", "version": "1.0.0", "event": event, "data": [data] });
    env::log_str(&format!("EVENT_JSON:{body}"));
}
