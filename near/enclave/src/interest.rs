//! Interest arithmetic, ported from `daml/pari/daml/Pari/Interest.daml` (Canton build, tag `pre-hackathon`).
//! Pure functions, so every number a lender receives can be recomputed from
//! the terms and the register.

use crate::money::{Cents, Date};
use serde::{Deserialize, Serialize};

/// An interest period with its fixed base rate in basis points (430 = 4.30%).
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct Period {
    pub start: Date,
    pub end: Date,
    pub base_rate_bps: u32,
}

/// One lender's line in the facility register.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct Entry {
    /// Principal currently held.
    pub principal: Cents,
    /// Interest on `principal` accrues from this date.
    pub accrual_start: Date,
    /// Interest already earned in the current period (before a trade) or left
    /// unpaid by a short payment, still owed to this lender.
    pub carried: Cents,
}

/// Base rate plus the facility margin, in basis points.
pub fn all_in_rate_bps(margin_bps: u32, base_rate_bps: u32) -> u32 {
    base_rate_bps + margin_bps
}

/// Simple interest on an ACT/360 basis, rounded down to cents.
pub fn accrual(principal: Cents, rate_bps: u32, from: Date, to: Date) -> Cents {
    let days = u128::from(to.days_since(from));
    Cents(principal.0 * u128::from(rate_bps) * days / (10_000 * 360))
}

impl Entry {
    /// Moves interest earned up to `as_of` into `carried` and restarts accrual
    /// there. Used when a position changes hands mid-period, so the seller
    /// keeps exactly the interest earned while it held the loan.
    pub fn accrue_to(&mut self, rate_bps: u32, as_of: Date) {
        self.carried += accrual(self.principal, rate_bps, self.accrual_start, as_of);
        self.accrual_start = as_of;
    }

    /// Interest owed to this entry for a period ending on `end`.
    pub fn interest_due(&self, rate_bps: u32, end: Date) -> Cents {
        self.carried + accrual(self.principal, rate_bps, self.accrual_start, end)
    }
}
