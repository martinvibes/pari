//! The enclave entry point. All deal logic is in the library; this file only
//! talks to OutLayer.

#[cfg(target_arch = "wasm32")]
mod enclave;

fn main() {
    #[cfg(target_arch = "wasm32")]
    enclave::run();
    #[cfg(not(target_arch = "wasm32"))]
    eprintln!("pari-core runs inside OutLayer: build it for wasm32-wasip2");
}
