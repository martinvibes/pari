//! Pari's private books for one syndicated loan.
//!
//! Everything here is plain Rust with no enclave imports, so the deal rules
//! and the sealing can be tested on any machine. The enclave entry point
//! (`main.rs`) stores the books and calls `protocol::handle`.

pub mod books;
pub mod interest;
pub mod money;
pub mod proofs;
pub mod protocol;
pub mod seal;
pub mod views;
