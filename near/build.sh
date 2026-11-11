#!/usr/bin/env bash
# Builds everything Pari deploys on NEAR: the rules contract, the test USDC
# token and the enclave program. Needs cargo-near and the wasm32-wasip2 target
# (rust-toolchain.toml installs the targets).
set -euo pipefail
cd "$(dirname "$0")"

# The enclave answers one contract only; its account is fixed in the build.
export PARI_LEDGER="${PARI_LEDGER:-ledger.${PARI_ROOT:-paridesk.testnet}}"

(cd contract && cargo near build non-reproducible-wasm)
(cd usdc && cargo near build non-reproducible-wasm)
(cd enclave && cargo build --release --target wasm32-wasip2)

echo
echo "enclave build for ${PARI_LEDGER}:"
shasum -a 256 enclave/target/wasm32-wasip2/release/pari-core.wasm
