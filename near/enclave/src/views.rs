//! What each party is entitled to see. One view per party, built from the
//! books after every command and sealed to that party's key by the enclave.
//!
//! | Party    | Sees                                                   | Never sees          |
//! | -------- | ------------------------------------------------------ | ------------------- |
//! | Agent    | register, requests, trades with prices, screening      |                     |
//! | Borrower | register, payments, trades, its own DQ list            | trade prices        |
//! | Auditor  | register, payments, trades                             | prices, the DQ list |
//! | Lender   | its own line, payments, cash and trades (with price)   | every other lender  |
//! | Buyer    | its own trades and cash                                | the DQ list         |

use crate::books::{Books, Request, Trade};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

/// Every party's view, keyed by account.
pub fn all(books: &Books) -> BTreeMap<String, Value> {
    let roles = &books.roles;
    let mut parties: BTreeSet<&str> = [roles.agent.as_str(), roles.borrower.as_str(), roles.auditor.as_str()].into();
    parties.extend(books.register.keys().map(String::as_str));
    parties.extend(books.cash.keys().map(String::as_str));
    parties.extend(books.view_keys.keys().map(String::as_str));
    for trade in &books.trades {
        parties.insert(&trade.seller);
        parties.insert(&trade.buyer);
    }
    parties.into_iter().map(|party| (party.to_string(), view(books, party))).collect()
}

/// One party's view of the books.
pub fn view(books: &Books, party: &str) -> Value {
    let roles = &books.roles;
    let (role, body) = if party == roles.agent {
        ("agent", whole_deal(books, true))
    } else if party == roles.borrower {
        let mut body = whole_deal(books, false);
        body["dq_list"] = json!(books.dq);
        ("borrower", body)
    } else if party == roles.auditor {
        ("auditor", whole_deal(books, false))
    } else {
        ("party", own_slice(books, party))
    };
    let mut out = json!({
        "role": role,
        "party": party,
        "seq": books.seq,
        "facility": books.terms,
        "period": books.period,
        "rate_bps": books.rate_bps(),
        "paid_through": books.paid_through,
        "cash": books.cash_of(party),
    });
    out.as_object_mut().expect("an object").extend(body.as_object().expect("an object").clone());
    out
}

/// The register, every payment and every trade. Prices and screening notes
/// are for the agent only.
fn whole_deal(books: &Books, with_prices: bool) -> Value {
    json!({
        "outstanding": books.outstanding(),
        "register": books.register,
        "requests": books.requests,
        "trades": books.trades.iter().map(|t| trade_view(t, with_prices, with_prices)).collect::<Vec<_>>(),
    })
}

/// A lender's or buyer's own line, payments and trades. Nothing about anyone else.
fn own_slice(books: &Books, party: &str) -> Value {
    let entry = books.register.get(party);
    let due = match (entry, books.period.as_ref(), books.rate_bps()) {
        (Some(entry), Some(period), Some(rate)) => Some(entry.interest_due(rate, period.end)),
        _ => None,
    };
    json!({
        "position": entry,
        "interest_due": due,
        "payments": books.requests.iter().filter_map(|r| payment_view(r, party)).collect::<Vec<_>>(),
        "trades": books
            .trades
            .iter()
            .filter(|t| t.seller == party || t.buyer == party)
            .map(|t| trade_view(t, true, false))
            .collect::<Vec<_>>(),
    })
}

fn payment_view(request: &Request, party: &str) -> Option<Value> {
    let due = request.legs.get(party)?;
    Some(json!({
        "request_id": request.id,
        "period_end": request.period_end,
        "due": due,
        "paid": request.paid.get(party),
        "status": request.status,
    }))
}

fn trade_view(trade: &Trade, with_price: bool, with_screening: bool) -> Value {
    let mut out = json!({
        "id": trade.id,
        "seller": trade.seller,
        "buyer": trade.buyer,
        "par": trade.par,
        "trade_date": trade.trade_date,
        "status": trade.status,
    });
    if with_price {
        out["price_ppm"] = json!(trade.price_ppm);
        out["cash"] = json!(trade.cash());
    }
    if with_screening {
        out["screening"] = json!(trade.screening);
    }
    out
}
