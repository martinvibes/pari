# Pari on NEAR: progress

Branch `near`, built for NEAR HACKATHON (window 2026-10-19 → 2026-11-14T23:59Z).
Baseline: tag `pre-hackathon` = 3c11dbc (the Canton build, 2026-10-07).

## Status

| Part | State |
| --- | --- |
| Setup (branch, tag, folders) | done |
| Spike 1: contract → OutLayer → callback, private storage | in progress |
| Spike 2: sealed envelopes | in progress |
| P0-a enclave logic | not started |
| P0-b rules contract | not started |
| P0-c web NEAR mode | not started |
| P0-d leak test | not started |
| P0-e trade with DQ screening | not started |

## Cut

Nothing yet.

## Verified facts (section 10 of the brief)

Sources: https://nearhackathon.com/HACKATHON.md, https://docs.near.org/llms.txt,
https://app.outlayer.ai/llms.txt, and the OutLayer source at
github.com/out-layer/outlayer (main @ 2d50bfa, 2026-11-11).

### Hackathon

- Development ends **2026-11-14T23:59:00Z** (Saturday; Sunday 00:59 Lagos). Judging from 2026-11-16, results by 2026-11-18.
- Q-003: a dedicated branch plus a `pre-hackathon` tag and a README section linking the diff is accepted.
- Q-015: each README names the builder's other project.
- Track ids: `privacy`, `realworld`.

### OutLayer: calling it from a contract

- Contract: `outlayer.testnet`. RPC: `https://rpc.testnet.fastnear.com`. HTTPS API (not used by Pari): `https://testnet-api.outlayer.ai`.
- `request_execution(source, resource_limits, input_data, secrets_ref, response_format, payer_account_id, params)` (contract/src/execution.rs).
  - `source` is `{"Project": {"project_id": "owner/name", "version_key": <sha256 or null>}}`. `version_key: None` means "the active version"; a value pins one build.
  - **Omitting `resource_limits` makes the call compile-only**: it must be passed to execute.
  - Hard caps: 500 B instructions, 180 s, 4096 MB. Defaults: 1 B instructions, 128 MB, 60 s.
  - `response_format: "Json"` returns the module's stdout as raw JSON bytes to the caller's callback.
  - Deposit: at least the estimated cost (`estimate_cost(limits)`); unused NEAR is refunded to `payer_account_id`.
  - `input_data` up to 10 KB is emitted in the `execution_requested` event log (public). Larger inputs are kept in state. Either way it is public, so secrets in it must be ciphertext.
- What the caller's callback receives (`on_execution_response`): on success, the output bytes (JSON as-is); on failure or timeout, `null`. It does **not** say which code hash ran; the contract knows it only because it pinned `version_key` in the request.
- Storage namespace (worker storage) exists only for `Project` sources; a raw `WasmUrl` run has none.

### OutLayer: inside the module

- Target: **wasm32-wasip2**. The `outlayer` SDK (crates.io, 0.2.x; storage interface `near:storage/api@0.2.0`) refuses wasip1.
- Who called: `OUTLAYER_EXECUTION_TYPE` is `"NEAR"` or `"HTTPS"`; `NEAR_PREDECESSOR_ID` is the contract that called `request_execution` (empty over HTTPS); `NEAR_SENDER_ID` is the transaction signer. The worker strips these names from secrets, so the caller cannot spoof them.
- Storage: `storage::set_worker` / `get_worker` keep project-wide records encrypted by the keystore, readable by every version of the project. `set_if_equals` gives compare-and-swap.
- Keys the module never holds: an `outlayer.manifest` custom section (`#[link_section = "outlayer.manifest"]`, covered by the wasm's sha256) declares `encryption_keys` and `signing_keys`. With `bind: "project"` and `caller: "predecessor"`, the keystore derives the key from (project, the contract that called). Only runs started by the ledger contract can derive Pari's key. `bind: "wasm"` keys are issued only to raw WasmUrl runs, which have no storage, so Pari uses `bind: "project"` and pins the version in the contract.
- `encryption_keys::{encrypt, decrypt, mac}(path, vault, data, aad)`.
- Secrets can also be generated inside the TEE (`outlayer secrets set --generate PROTECTED_X:hex32`), locked to one build (`--build <sha256>`) and to calls through one contract (`--direct --via <contract>`).

### NEAR testnet

- Public RPC (docs.near.org/api/rpc/providers): `https://rpc.testnet.fastnear.com` (OutLayer's choice), `https://near-testnet.drpc.org`, `https://testnet-rpc.intea.rs`.
- Faucet: built into docs.near.org and https://near-faucet.io.
