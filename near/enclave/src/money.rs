//! Money as whole cents and dates as whole days. No floats anywhere.

use serde::{de::Error as _, Deserialize, Deserializer, Serialize, Serializer};
use std::fmt;

/// An amount in cents. Travels as a decimal string so JavaScript cannot round it.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default, Debug)]
pub struct Cents(pub u128);

impl Cents {
    pub const ZERO: Cents = Cents(0);

    /// `self - other`, or `None` when that would go below zero.
    pub fn minus(self, other: Cents) -> Option<Cents> {
        self.0.checked_sub(other.0).map(Cents)
    }
}

impl std::ops::Add for Cents {
    type Output = Cents;
    fn add(self, other: Cents) -> Cents {
        Cents(self.0 + other.0)
    }
}

impl std::ops::AddAssign for Cents {
    fn add_assign(&mut self, other: Cents) {
        self.0 += other.0;
    }
}

impl std::iter::Sum for Cents {
    fn sum<I: Iterator<Item = Cents>>(iter: I) -> Cents {
        Cents(iter.map(|c| c.0).sum())
    }
}

/// Prints as dollars with thousands separators: `1,971,666.66`.
impl fmt::Display for Cents {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let whole = (self.0 / 100).to_string();
        let mut grouped = String::new();
        for (i, digit) in whole.chars().enumerate() {
            if i > 0 && (whole.len() - i).is_multiple_of(3) {
                grouped.push(',');
            }
            grouped.push(digit);
        }
        write!(f, "{grouped}.{:02}", self.0 % 100)
    }
}

impl Serialize for Cents {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.collect_str(&self.0)
    }
}

impl<'de> Deserialize<'de> for Cents {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Cents, D::Error> {
        let text = String::deserialize(d)?;
        text.parse().map(Cents).map_err(|_| D::Error::custom("cents must be a whole number in a string"))
    }
}

/// A calendar date, held as days since 1970-01-01. Travels as `YYYY-MM-DD`.
/// Deal dates are inputs to the books, never the chain's clock.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
pub struct Date(i32);

impl Date {
    pub fn new(year: i32, month: u32, day: u32) -> Option<Date> {
        if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
            return None;
        }
        let date = Date(days_from_civil(year, month, day));
        // Rejects dates like 31 February, which would otherwise roll over.
        (date.civil() == (year, month, day)).then_some(date)
    }

    /// Whole days from `earlier` to `self`; zero if `earlier` is later.
    pub fn days_since(self, earlier: Date) -> u32 {
        (self.0 - earlier.0).max(0) as u32
    }

    fn civil(self) -> (i32, u32, u32) {
        let z = self.0 + 719_468;
        let era = z.div_euclid(146_097);
        let doe = z.rem_euclid(146_097);
        let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
        let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
        let year = yoe + era * 400 + i32::from(month <= 2);
        (year, month, day)
    }
}

fn days_from_civil(year: i32, month: u32, day: u32) -> i32 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = y.div_euclid(400);
    let yoe = y.rem_euclid(400);
    let mp = (month as i32 + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day as i32 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

impl fmt::Display for Date {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let (year, month, day) = self.civil();
        write!(f, "{year:04}-{month:02}-{day:02}")
    }
}

impl std::str::FromStr for Date {
    type Err = &'static str;
    fn from_str(text: &str) -> Result<Date, Self::Err> {
        let mut parts = text.split('-');
        let mut next = || parts.next().and_then(|p| p.parse::<u32>().ok());
        match (next(), next(), next(), parts.next()) {
            (Some(y), Some(m), Some(d), None) => Date::new(y as i32, m, d).ok_or("no such date"),
            _ => Err("dates are written YYYY-MM-DD"),
        }
    }
}

impl Serialize for Date {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.collect_str(self)
    }
}

impl<'de> Deserialize<'de> for Date {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Date, D::Error> {
        String::deserialize(d)?.parse().map_err(D::Error::custom)
    }
}
