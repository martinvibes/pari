# Pari on NEAR: progress

Branch `near`, built for NEAR HACKATHON (window 2026-10-19 → 2026-11-14T23:59Z).
Baseline: tag `pre-hackathon` = 3c11dbc (the Canton build, 2026-10-07).

## Status (2026-11-11, evening UTC)

| Part | State |
| --- | --- |
| Setup (branch, tag, folders) | done |
| Spike 1: contract → OutLayer → callback, private storage | **pass** |
| Spike 2: sealed envelopes | **pass** |
| P0-a enclave logic | **done**: `cargo test` in `near/enclave`, 21 tests green with the golden numbers |
| P0-b rules contract | **done**: `cargo test` in `near/contract`, 25 tests green; deployed at `ledger.paridesk.testnet`; `npm run e2e` all green on testnet |
| P0-c web NEAR mode | **done**: the whole acceptance flow played in a real browser against testnet |
| P0-d leak test | **done**: `npm run prove:privacy` passes, 0 secrets in 1,476,899 bytes of public data |
| P0-e trade with DQ screening | **done**: in the end-to-end script and in the browser |
| README and submission drafts | **done**: `README.md`, `docs/hackathon/SUBMISSION.md` |
| P1: two-of-three agent, second period | **cut** (see Cut) |

Nothing has been pushed, posted or submitted. Those steps are the builder's.

## What works

- **Interest.** The agent fixes the rate and requests 1,971,666.66. The borrower pays with one `ft_transfer_call`. One settlement credits Alder 985,833.33, Birch 591,500.00 and Cedar 394,333.33 inside the books. The chain shows the one total.
- **The Revlon refusal.** The agent types 900,000,000.00. The enclave refuses: "You entered 900,000,000.00; the register says 1,971,666.66." The refusal is on the public record and the books do not move. The contract has its own caps as a second guard (credited ≤ paid in, payouts ≤ held).
- **Withdrawal.** Alder withdraws 500,000.00; the contract pays exactly that in test USDC.
- **A screened trade.** The borrower seals a DQ list naming Rival. Rival's trade is "not settled" and Rival is told no more; the agent's envelope alone holds the reason. Delta buys 10,000,000.00 at 99.50, cash against loan in one step. Alder keeps the interest it earned to the trade date (65,000.00 on the part sold).
- **Who sees what.** Eight sealed envelopes, one per party, rewritten after every action. `/visibility` shows the public chain beside every party's opened envelope and re-checks seven claims on every load.
- **A server with no keys.** The web app still renders `/visibility` as the public reads it, with every envelope sealed.
- **The leak test.** Every transaction of the recorded run plus the contract's whole storage, searched for 16 secrets: none found. The same search finds what Pari publishes on purpose, and finds 13 of 13 secrets inside the opened envelopes.

## The recorded run: deal `northwind-4`

Played by `npm run e2e` on 2026-11-11. Books at seq 23, fingerprint
`a36f61c021543fc351c9c3c4e1006b9b1c4b0eac0d4667444e5f28212c808eb1`. All 28
transactions are in [`near/runs/northwind-4.json`](../../near/runs/northwind-4.json).

- Rules contract build: sha256 `8caf224b95fd100ae6f563d1bced969101c6528718958f148621914f02ee2ce0` (292,552 bytes).
- Enclave build pinned by the contract: sha256 `4fd3ba96a54d17244166e32c41b9eda73cf6ed1a5323e22b9f5fa0bc4aafff9a`, OutLayer project `paridesk.testnet/pari-core`.
- 26 of the 28 transactions ran the enclave, each with an Intel TDX attestation from OutLayer (`https://testnet-api.outlayer.ai/attestations/by-tx/<hash>`). The other two are the contract's own setup calls.

| Step | Transaction |
| --- | --- |
| New deal started on the contract | [4rwti7GC…](https://testnet.nearblocks.io/txns/4rwti7GCTWHXxaocqyVr2WsCQz6e9ddy9SGHUeyp5j96) |
| Ended deals swept out of storage | [4NR9UjQv…](https://testnet.nearblocks.io/txns/4NR9UjQvU8syoWVyz3YGigkHzLz46n1ibrxRHqqVNt5F) |
| Enclave's public key published | [DWs7hvhD…](https://testnet.nearblocks.io/txns/DWs7hvhDAUQe8Wd2GakzEqkb3oNHz1TmYk6jiej1yYfh) |
| Deal loaded, opening positions sealed | [BbY4HPwA…](https://testnet.nearblocks.io/txns/BbY4HPwAdjpMzVNTZdjb2qhD7WAyJPVRgyZcqoAJ5AUG) |
| View keys: agent, borrower | [GCab9YTp…](https://testnet.nearblocks.io/txns/GCab9YTpTuiXhZ6cTgd1FeKhLjuMXAUcwuaKeVnhBDfT), [FwmYeJSu…](https://testnet.nearblocks.io/txns/FwmYeJSuG2Zkqg6qcBdo1RGimgbVYnb5MakuVTLM1X6z) |
| View keys: Alder, Birch, Cedar | [BqQgyJYU…](https://testnet.nearblocks.io/txns/BqQgyJYUKr51a1XbMxtV7VkvQEWkjPHRDqJmU9AR1LEx), [4LYvRQz4…](https://testnet.nearblocks.io/txns/4LYvRQz4UPedFHSmQR6vXcNh6xQHbaCvGyPKe6aEBT1V), [BhNmDVZg…](https://testnet.nearblocks.io/txns/BhNmDVZgbi4hSEUnKS3YwE5YEbWPhQ69zQwDcDyzzkfc) |
| View keys: Delta, Rival, auditor | [EzQ7pXee…](https://testnet.nearblocks.io/txns/EzQ7pXeeBUmw4FwKPRQ5uXuatK3m7eEHAiVu85t6aa5c), [ywMWw1TF…](https://testnet.nearblocks.io/txns/ywMWw1TFoPtQkHxbeEVfEc3owipbDC4FnmWHuhofbBc), [84UFbzG4…](https://testnet.nearblocks.io/txns/84UFbzG4G6x5cWU5FhafnF61weKnUyNDJBczWrBhFGNq) |
| Agent fixes the rate, 4.30% + 3.50% | [52rjbLek…](https://testnet.nearblocks.io/txns/52rjbLekNeGTSfJYWNdv1yrYmsaG7nK2V2fzZk1dTxWM) |
| Agent types 900,000,000.00: **refused** | [3pQAtvaT…](https://testnet.nearblocks.io/txns/3pQAtvaTdwKrjuP8HHRyBomTtNfXWDN5ai3RXPRcnarD) |
| Agent requests 1,971,666.66 | [CPvYf4kn…](https://testnet.nearblocks.io/txns/CPvYf4kn1ZhrrwBpMGxViSiuufX7ijEVUb2VHdVK2HM4) |
| Borrower pays 1,971,666.66 | [CScqsy5h…](https://testnet.nearblocks.io/txns/CScqsy5hbSVE4B9snuodBfBBFsxx3P4d9EJm4mFWmM5B) |
| Agent settles: three lenders in one step | [7UtB85n4…](https://testnet.nearblocks.io/txns/7UtB85n4ZDW98VRmw9X1i9vKaD1Vwvr3MJeCKexDvigQ) |
| Alder withdraws 500,000.00 | [8KxtwT3P…](https://testnet.nearblocks.io/txns/8KxtwT3PWZQXW685iELqNwdTFMRqUBxxgHBmtFvd3gn3) |
| Agent fixes the rate for the second period | [EMJ9aAaf…](https://testnet.nearblocks.io/txns/EMJ9aAafbAmXSwfjZhxLEfYSKmvMybNJMH9tdBUzsSZx) |
| Borrower sets its DQ list, sealed | [GxcBaNvD…](https://testnet.nearblocks.io/txns/GxcBaNvD1iw1fuR3FMFLPLqXrfCLcbao21V5DHFUsbUF) |
| Rival pays 12,000,000.00 in | [9Ar8NnCv…](https://testnet.nearblocks.io/txns/9Ar8NnCvgLjUXssyf5CnkFT3JufnusxMXvy4TEjvyjbo) |
| Delta pays 12,000,000.00 in | [B1pR7wrN…](https://testnet.nearblocks.io/txns/B1pR7wrNKC6ubcg9yAnD6kNRBondeJp7sbhsUKUQTYDY) |
| Alder offers 10,000,000.00 to Rival, sealed | [DQRTCkzd…](https://testnet.nearblocks.io/txns/DQRTCkzdCx4C8nE1XsYLxQgcJjzuKKqhMUdmZsRWAwhJ) |
| Rival accepts | [AanuTRbx…](https://testnet.nearblocks.io/txns/AanuTRbxKgXZdzqJu6GTb5VDkqVLgpKcExky2KijXMtK) |
| Agent settles: **not settled**, Rival learns nothing | [C5BqZGES…](https://testnet.nearblocks.io/txns/C5BqZGESJo5PVc4QVuDXtwaJqXwmGGcvuybGu32z7XWe) |
| Alder offers 10,000,000.00 to Delta, sealed | [4FwjC1ht…](https://testnet.nearblocks.io/txns/4FwjC1htNKBDYC9ag86v14BVCEhPQCfRNEBfUBdejNYT) |
| Delta accepts | [EqB7S9VW…](https://testnet.nearblocks.io/txns/EqB7S9VWdGR26VCN4ToxwjoihkSmn6teB2rrgeHa6xjv) |
| Agent settles: cash against loan in one step | [Bx72JcyT…](https://testnet.nearblocks.io/txns/Bx72JcyT5XGLAM46YPRAreLnxbtKXxXBi5Ajr91szj86) |

Earlier deals (`northwind-1` to `northwind-3`) were played on earlier builds of
the contract; their storage has been swept and their transactions remain on the
chain.

## Browser acceptance (P0-c)

Played on deal `northwind-3` on 2026-11-11 in headless Chrome, driven over the
DevTools protocol, against testnet. Every step passed:

1. Agent fixes the rate: "Base rate fixed at 4.30% to 15 Dec 2026. All-in 7.80%."
2. Agent types 900,000,000.00: refused, "the register says 1,971,666.66".
3. Agent requests the right total; borrower pays; agent settles all three lenders in one step.
4. `/lender/alder` shows 985,833.33 and no other lender's payment; Birch 591,500.00; Cedar 394,333.33.
5. `/auditor` shows all three payments. `/visibility` shows one total on the public chain and no lender's share; seven live checks hold.
6. Borrower saves a sealed DQ list. Rival's trade is not settled and Rival's screen gives no reason. Delta's trade settles; Delta holds 10,000,000.00; the borrower's envelope has no price.

Each action took 11 to 22 seconds, because the contract waits for the enclave.

## Spike results (2026-11-11, testnet)

Run with `npm run spike` in `near/scripts`. Contract `spike.paridesk.testnet`,
OutLayer project `paridesk.testnet/pari-spike`, build pinned by sha256
`9979ef7c3736f633e654017c0508d4474328de979e472ab3fc8c4eb9d892fc8c`.

**Spike 1: pass.** Two contract-initiated runs returned consecutive counts from worker storage.

- count 1: [DzZnpLjC…](https://testnet.nearblocks.io/txns/DzZnpLjC9v2BxKX2UXNu9evKTvE7xfM8x8kt4WdPojvv), count 2: [Asmj6Xdb…](https://testnet.nearblocks.io/txns/Asmj6XdbBvddWwQ9sfpDavYMeGqkHhUd7RWFav5F3qPB)
- rerun, 5 → 6: [GtD9XsAo…](https://testnet.nearblocks.io/txns/GtD9XsAo9AKw7YXQjx7Kszzoh2sxNzxnch1TQcJYCRgk), [44Rcwzt1…](https://testnet.nearblocks.io/txns/44Rcwzt1nASFfw7RW8sVCQDKacnBBKLEYrmGjgDvoFRa)
- Latency, request to callback: 11 to 16 blocks, 6.3 to 9.8 s typical (one run 27 blocks, 15.8 s). Wall time to finality 10 to 14 s.
- Callback payload: the module's JSON output as-is (`{"ok":true,"result":{...}}`), or `null` when the run fails.
- Deposit: 0.01 NEAR attached covers the 0.007 NEAR estimate for {10B instructions, 128 MB, 60 s}; the rest is refunded to the payer. A failed run costs 0.001 NEAR.
- Code hash: the callback does not report it. The contract pins the build by passing `version_key` (the wasm sha256) in `source`.
- The module saw `predecessor = spike.paridesk.testnet`, `signer = paridesk.testnet`, and the transaction hash.

**Spike 2: pass.** The enclave derives an X25519 key from a keystore key it never sees, opens a libsodium sealed box, and seals its reply to the client's key.

- enclave public key: [2BYZ3oun…](https://testnet.nearblocks.io/txns/2BYZ3ounffPHkbyjt2ey5crspKQ7sNERcD2FSNqXv9hi)
- sealed round trip: [4G9Wz1Fv…](https://testnet.nearblocks.io/txns/4G9Wz1FvciyYiZNdGS5XN6tMwNUmF6fQS8BNvC3LNiQm). The script searched the whole transaction (args, logs, return values, base64-decoded) for the secret price and the DQ entry: none found.
- Rust `crypto_box` 0.9.1 (`seal`) and TS `libsodium-wrappers` 0.8.4 interoperate.

**Gotcha: FastFS.** `outlayer upload` can report success while the gateway never serves the file (first upload [J7sYWyuM…](https://testnet.nearblocks.io/txns/J7sYWyuMSnBeTpHv5SX23xBmpdSgPXkYdNqLnq8xuhu3) stayed 404 for 30+ minutes). Uploading the same bytes again ([B2HHDPiA…](https://testnet.nearblocks.io/txns/B2HHDPiAKGFjpP7dXAgJhJZqp1L6kcqwKxY5QvDz94Pk)) served within seconds. Always check the URL's sha256 before deploying a version.

Setup transactions: root account [G1ZSCUNe…](https://testnet.nearblocks.io/txns/G1ZSCUNefRpokiTrv38xHcvSUuucGY3LuhcL4A59NjqD), create_project [Adeiu9uj…](https://testnet.nearblocks.io/txns/Adeiu9ujRRR91eaHuyrpGtJJ2JUadmTL8RqGmJjU9VvQ), spike account [4xQky8eW…](https://testnet.nearblocks.io/txns/4xQky8eWpuBw9CgqP3ceEJzcZXnvYKGEe4BcG6ocTPMo), spike deploy [Dw1tMpyo…](https://testnet.nearblocks.io/txns/Dw1tMpyow6SBXFD34QhRV4frPP6ujnabQJrZ2A3Ucjmf).

## Cut

- **P1: the two-of-three agent (Sputnik DAO) and the second period.** Left out to finish P0 properly. The enclave does share a short payment pro rata and carry the unpaid part (tested in `near/enclave/tests/interest.rs`), but no testnet run shows a second period.
- **The brief's cut list**, as planned: prepayment, MNPI documents and the information wall, the 100-lender scale test, Confidential Intents withdrawals, an AI agent, mainnet, Canton Coin.
- **No hosted NEAR demo yet.** `near/Dockerfile` and `npm run demo:env` are ready. The same standalone server was run locally with that env file and no other keys; the Docker image build itself has not been run.
- **The landing page and `/docs` still describe the Canton build.** Only the app screens switch with `PARI_BACKEND=near`.
- **The enclave build is not bit-for-bit reproducible across machines.** The contract pins the sha256 of the build that was uploaded.

## Next (the builder's steps)

1. Push branch `near` (this publishes the NEAR work), and decide which branch judges see: see `SUBMISSION.md`.
2. Record the demo video against a fresh deal (`npm run setup -- --fresh`), and add its link at the top of the README.
3. Optional: host the NEAR demo, and keep it up through 2026-11-18.
4. Add a line naming Pari to Selkie's README.
5. Post on X, then submit the form, before 2026-11-14T23:59:00Z.

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

### Found while building (2026-11-11)

- **The faucet starts a new account with 10 NEAR** (the root account's creation: [G1ZSCUNe…](https://testnet.nearblocks.io/txns/G1ZSCUNefRpokiTrv38xHcvSUuucGY3LuhcL4A59NjqD)). Setup needs about 18 NEAR in the root account: 5 for the ledger, 2.5 for the token, 1.5 for the agent, 0.9 for each other party.
- **near CLI 0.30.1** (`--help`): `near account create-account sponsor-by-faucet-service YOU.testnet autogenerate-new-keypair save-to-legacy-keychain network-config testnet create`, and `near tokens A send-near B '9.5 NEAR' network-config testnet sign-with-legacy-keychain send`.
- **Ordinary RPC nodes drop old transactions.** The leak test reads transactions from an archival node, `https://archival-rpc.testnet.fastnear.com`.
- **Contract storage has to stay small to be read in one call.** A whole played deal measures 16,042 bytes in 43 keys. The limit on `view_state` is understood to be 50,000 bytes by default; that figure was not confirmed against a node's configuration. The contract's `sweep` removes ended deals, so storage holds one deal at a time.
- **Next.js 14 keeps the answers to chain reads.** Its data cache stored near-api-js's RPC POST responses for a year, even on pages marked `force-dynamic`, so a screen could show an old deal. Fixed with `export const fetchCache = "force-no-store"` in `web/app/(app)/layout.tsx`.
- **near-api-js 7.5.3 does not retry a dropped connection.** It retries HTTP 500, 503 and 408 only; Node's `TypeError: fetch failed` stops the script. The scripts wrap `fetch` with six attempts.
- **near-api-js 7.5.3 declares Node 22.22.2 or later** but ran correctly here on Node 20.20.2, 22.16.0 and 22.23.2 (a view call, key generation, libsodium).
- **The submission form** (`POST https://nearhackathon.com/api/applications`): the exact fields are in `SUBMISSION.md`. The X post is the `demoUrl`.
