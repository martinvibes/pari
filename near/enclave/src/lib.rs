//! Pari's private books for one syndicated loan.
//!
//! Everything here is plain Rust with no enclave imports, so the deal rules
//! can be tested on any machine. The enclave entry point wraps `books::step`.

pub mod books;
pub mod interest;
pub mod money;
pub mod views;
