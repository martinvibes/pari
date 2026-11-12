# Pari on NEAR: progress

Branch `main`, built for NEAR HACKATHON (window 2026-10-19 → 2026-11-14T23:59Z).
Baseline: tag `pre-hackathon` = 392e45c (the Canton build as of 2026-10-07, its earlier commits folded into that one commit).

## Status (2026-11-12, 11:00 UTC)

| Part | State |
| --- | --- |
| Setup (branch, tag, folders) | done |
| Spike 1: contract → OutLayer → callback, private storage | **pass** |
| Spike 2: sealed envelopes | **pass** |
| P0-a enclave logic | **done**: `cargo test` in `near/enclave`, 28 tests green with the golden numbers |
| P0-b rules contract | **done**: `cargo test` in `near/contract`, 26 tests green; deployed at `ledger.paridesk.testnet`; `npm run e2e` all green on testnet |
| P0-c web NEAR mode | **done**: the whole acceptance flow played in a real browser against testnet |
| P0-d leak test | **done**: `npm run prove:privacy` passes on both recorded runs (figures below) |
| P0-e trade with DQ screening | **done**: in the end-to-end script and in the browser |
| README and submission drafts | **done**: `README.md`, `docs/hackathon/SUBMISSION.md` |
| P1: two-of-three agent | **done**: the deal's agent can be a Sputnik DAO; played by `npm run e2e` and in the browser |
| P1: second period | **done**: a short payment and the period that pays the rest, played by `npm run e2e` on testnet and in the browser |
| Late answers | **done**: an enclave answer that misses NEAR's two-minute wait changes nothing, and the action can be sent again. Tested in Rust; the resend ran on testnet during the outage's recovery |
| Proofs: one fact, and nothing else | **done**: a real proof cut and checked on testnet by `npm run e2e` and `npm run verify:proof`, and in the browser on `/verify` |
| Two privacy gaps found by review | **fixed**, tested and played on testnet (below) |
| The live deal on testnet | `northwind-14` on `ledger.paridesk.testnet`, played to the end of the third period (seq 30), pinned to enclave build `edef73c7…` |

Everything in the README has been run on testnet with real transactions, on the final builds. Nothing has been pushed, posted or submitted. Those steps are the builder's.

## What works

- **Interest.** The agent fixes the rate and requests 1,971,666.66. The borrower pays with one `ft_transfer_call`. One settlement credits Alder 985,833.33, Birch 591,500.00 and Cedar 394,333.33 inside the books. The chain shows the one total.
- **The Revlon refusal.** The agent types 900,000,000.00. The enclave refuses: "You entered 900,000,000.00; the register says 1,971,666.66." The refusal is on the public record and the books do not move. The contract has its own caps as a second guard (credited ≤ paid in, payouts ≤ held).
- **Withdrawal.** Alder withdraws 500,000.00; the contract pays exactly that in test USDC.
- **A screened trade.** The borrower seals a DQ list naming Rival. Rival's trade is "not settled" and Rival is told no more; the agent's envelope alone holds the reason. Delta buys 10,000,000.00 at 99.50, cash against loan in one step. Alder keeps the interest it earned to the trade date (65,000.00 on the part sold).
- **A short payment, and the period that pays the rest.** The borrower pays 975,000.00 of the 1,950,000.00 requested for the second period. One settlement pays every lender the same half of what it is owed (Alder 422,500.00, Birch 292,500.00, Cedar 195,000.00, Delta 65,000.00) and the other half stays owed. The third period's request is 2,968,333.32: its own interest plus every unpaid half, paid in full.
- **The agent as two of three.** `npm run setup -- --fresh --dao` names a Sputnik DAO (`paridesk-agent.sputnikv2.testnet`, council `op1`, `op2`, `op3`) as the deal's agent, with no change to the contract or the enclave. Each agent action is a proposal to call the rules contract. Operator 1 proposes and approves and nothing moves; a second operator's approval runs DAO → contract → enclave → callback in one transaction. Two operators approving 900,000,000.00 are still refused by the enclave.
- **Who sees what.** Eight sealed envelopes, one per party, rewritten after every action. `/visibility` shows the public chain beside every party's opened envelope and re-checks eight claims on every load.
- **A server with no keys.** The web app still renders `/visibility` as the public reads it, with every envelope sealed.
- **An answer that comes late counts for nothing.** The contract sends the enclave the fingerprint it holds and the number of the request. The enclave builds only on the books with that fingerprint, and refuses a request with a lower number than one it has answered. So when the enclave misses NEAR's wait the contract records "the enclave did not answer; nothing changed", and a run that finishes later cannot change the books. Tests: `test_an_answer_the_contract_never_received_is_not_built_on`, `test_a_late_run_cannot_undo_an_answer_the_contract_received`.
- **Proofs.** With every answer the enclave returns one commitment per party: the sha256 of the salted hashes of the facts in that party's view. The contract stores it beside the envelope. A party cuts a proof of one fact (what it holds, its cash, one payment, the register) and anyone checks it with no keys against `envelope(party)` at the proof's block: `/verify` in the app, `npm run verify:proof` in the scripts. Tests: `test_a_party_proves_one_fact_and_shows_nothing_else`, `test_a_commitment_is_new_with_every_answer_and_confirms_no_guess`, `test_the_enclave_and_the_proof_checker_agree_on_a_known_view`. On testnet: each recorded run leaves Alder's proof of what it holds in `near/proofs`; the check passes, a proof with one digit changed is rejected by the arithmetic, and one with the changed hash forged into the list is rejected by the chain's commitment.
- **A fingerprint that confirms no guess, and sealed boxes that work for their sender only.** See "Two privacy gaps found by review".
- **The leak test.** Every transaction of a recorded run plus the contract's whole storage, searched for 29 secrets: none found. The same search finds what Pari publishes on purpose. With the parties' keys it finds 24 of 24 secrets inside the opened envelopes; the other five are from earlier in the deal and no longer in the books.

## The OutLayer outage of 11 November

OutLayer's testnet gave no answer for about an hour, from about 21:38 to 22:41 UTC on 2026-11-11. It was not a fault in Pari, and it has recovered. Since then each action has taken about 15 seconds.

- Through the day OutLayer answered in 6 to 16 seconds. In the evening it took 60 to 80 seconds, then 92 and 108. From 21:38 UTC it did not answer at all within NEAR's wait of about two minutes.
- `npm run setup -- --fresh` started deal `northwind-9`, then stopped at its first enclave call. Four requests for the enclave's key went unanswered: [81gqvip7…](https://testnet.nearblocks.io/txns/81gqvip7KTLnMngWLPsaJXbQev9mLdGF24qc3eZH99LE), [9hPmbGmY…](https://testnet.nearblocks.io/txns/9hPmbGmYf72TXDAdatoyiEnrGeuvmq4xhveNQdYWdt1V), [3LqAWghd…](https://testnet.nearblocks.io/txns/3LqAWghdi2HVNxQQQn3hYMiFUFUnwARdFsgjP5G3LY4j), [Hc1XkrY7…](https://testnet.nearblocks.io/txns/Hc1XkrY7pBYkHkJr3gPXxroakQmMXt32trng2sDNNHTT).
- The receipts of the second one show what happens. OutLayer logs `execution_requested` 1.1 seconds in. At 120.1 seconds it logs `Execution promise failed`, refunds the unused deposit and charges 0.001 NEAR. The ledger then records "the enclave did not answer; nothing changed" and releases its lock. OutLayer has no attestation for any of the four (`/attestations/by-tx/<hash>` answers 404), so no worker ran them.
- **It was not the build.** The day-one counter program (`npm run spike`, another OutLayer project, a build that answered all day) got no answer either, at 21:47 and 21:49 UTC: [CooGFm45…](https://testnet.nearblocks.io/txns/CooGFm45HQvfnXnrFtUeJNFcsHgRcHSapfxx48ryj12y), [gHacNYUi…](https://testnet.nearblocks.io/txns/gHacNYUiWvTDXMXiJZeo1h43HBBQ8vCtMqSg8rdjUCz).
- OutLayer's contract was not paused (`is_paused` on `outlayer.testnet` returned `false`).
- **It was not only Pari.** `get_stats` on `outlayer.testnet` counted 75 more executions between 21:53 and 22:04 UTC (26,285 to 26,360), and its total of fees rose by exactly 0.075 NEAR: 0.001 NEAR each, which is what a run that fails is charged. About five of the 75 were Pari's.
- **When it came back.** The last request that got no answer was sent at 22:38:42 UTC ([5tQcRqET…](https://testnet.nearblocks.io/txns/5tQcRqETDVZzB6pFL9rRuw5dLVyFymG5VBPsuY8JRC2P)); the first one answered was sent at 22:40:46 ([7Nzr7uGw…](https://testnet.nearblocks.io/txns/7Nzr7uGwrJbLvThvfmDguZxJ2v8DaQLR2gGrSmE2ubx3)). The setup of `northwind-9` finished at 22:46.
- What the scripts do about it: an action whose transaction carries the ledger's "the enclave did not answer" is sent again, up to four times. That is safe because of the late-answer rule (see "What works"). The run of `northwind-9` carries those resends.

## Two privacy gaps found by review, and fixed (11 November)

After the first full runs passed, the enclave was read again the way an attacker would read it. Two gaps turned up. The leak test could see neither, because it searches for plaintext.

1. **The fingerprint could confirm a guess.** It was a plain sha256 of the books. The chain shows what that means: deals `northwind-9` and `northwind-11`, played the same way on that build, have the same fingerprint at seq 8 (`74b862fccb48380c61ac938369625127b0def77a35df5472b09b91b40ca708dd`) and at seq 30 (`9e88aeec82f52cb0291d88aad7ac2639abbc9f550d8c82e1a9b3ba30f2c0248b`). Loan positions are round numbers, so anyone could hash a guess at the books and compare.
   - **Fix:** the books carry 32 random bytes, which the enclave draws again with every answer. They are in the fingerprint and in no view.
   - **Test:** `test_a_fingerprint_confirms_no_guess_at_the_books`.
   - **On testnet:** `northwind-14` is the same deal played the same way on the final build. Its fingerprints are `4f84034fd40ec33df5578c347558697cba0727912a2c2f333c8afb2ac922e169` at seq 8 and `edc0f805ae47adb269a4f008a0a6b843ca1339ff2490c0772e731751ccf72fd5` at seq 30.
2. **A sealed box was not tied to its sender.** A sealed offer sits on the public chain. Birch holds more than the trade's size, so it could have sent Alder's sealed offer as its own, and read the buyer, the size and the price in its own envelope.
   - **Fix:** the sealed fields name the deal, the caller and the command they are for, and the enclave refuses a box that arrives any other way: "these fields were sealed for another deal, caller or command".
   - **Test:** `test_a_sealed_offer_copied_from_the_chain_is_no_use_to_anyone_else`.
   - **On testnet:** `npm run e2e` plays it. Birch's copy of Alder's sealed offer was refused on both recorded runs, and Birch's envelope showed no trade: [C2rKHgyb…](https://testnet.nearblocks.io/txns/C2rKHgybrk4Ep3oFfyvW7gW3wSe8ENbFR1UdhXvqwqyJ) on `northwind-14`, [6X64VPdh…](https://testnet.nearblocks.io/txns/6X64VPdhw8nsahFxyKehnHHoYTmE85CBVCAqTqetD4XN) on `northwind-13`.

Read in the same pass and found clean: every command's public output, every refusal's wording (none carries a private figure; the Revlon refusal states the total, which is public by design), and the trade settlement, which checks the seller's position again when it settles.

Known and not fixed: any account can register a view key, offer or accept a trade, pay test USDC in or ask for a withdrawal, because a buyer has to register before it holds anything. An outsider can't read the books or move anyone's money, but it can hold the one-at-a-time lock, make the contract pay OutLayer for a run, and add an envelope slot. Envelopes are not padded, so their sizes show roughly how much a view holds. Both are in the README's trust model.

## The recorded runs: deals `northwind-13` and `northwind-14`

Both were played by `npm run e2e` on the final builds. Their run logs and the proofs they left are in the repository ([`near/runs`](../../near/runs), [`near/proofs`](../../near/proofs)), and the README's tables come from them.

- Rules contract build: sha256 `efa1fa65155ce9c6f6ce81111b3e3a7b6cd00ba05620f63355d94bf50d92d224` (292,255 bytes).
- Enclave build pinned by both deals: sha256 `edef73c7a53ee924982553f96886efab8bc2cb1d000d51e74f9026118d0c705d`, OutLayer project `paridesk.testnet/pari-core`.

| | `northwind-13` | `northwind-14` |
| --- | --- | --- |
| The agent | the DAO, two of three operators | one key |
| Played (UTC) | 11 Nov 23:33 to 12 Nov 05:25 | 12 Nov 05:25 to 05:35 |
| Transactions | 62 | 36 |
| Of those, runs of the enclave, each with an Intel TDX attestation | 34 | 34 |
| Books at the end | seq 30, fingerprint `63ac48db69ae523222f6cdcf6a619f844698d00310ad4ef234c69fd0fbd7f06b` | seq 30, fingerprint `edc0f805ae47adb269a4f008a0a6b843ca1339ff2490c0772e731751ccf72fd5` |
| `npm run e2e` | All green | All green |
| `npm run prove:privacy` | PASS: 0 secrets in 2,585,777 bytes | PASS: 0 secrets in 2,216,417 bytes |
| Its control, with the parties' keys | 24 of 24 found inside the opened envelopes | 24 of 24 |
| `npm run verify:proof` | PASS, at block 277318993 | PASS, at block 277320067 |

- `northwind-13` took six hours on the clock because the builder's machine was asleep for most of them, in the middle of the run. When it woke the script carried on from the step it was at and finished all green: the deal's state is on the chain and in the enclave, not in the script.
- From a fresh clone with no keys (2026-11-12): `cargo test` passes in `near/enclave` (28) and `near/contract` (26), and `npm run prove:privacy` and `npm run verify:proof` pass on `northwind-14`. The README's two output blocks are from that run.
- `northwind-14` is the live deal. The proof `northwind-13` left still checks against the chain now that the contract has moved on: `npm run verify:proof -- ../proofs/northwind-13.json` passes and says "The deal has moved on since; the proof is of that block."

### Deal `northwind-14`, every transaction

| Step | Transaction |
| --- | --- |
| New deal started on the contract, pinning the enclave build | [APPwXRPT…](https://testnet.nearblocks.io/txns/APPwXRPTx8RpKBPaCXT2jn9NxGgbfoHYv2ecgQdA2Jgs) |
| Ended deals swept out of storage | [EjVksBzg…](https://testnet.nearblocks.io/txns/EjVksBzg71gitdejWcEVUdDWPswRP7wK6r8msBDwdMQx) |
| Enclave's public key published | [Rs8QhVru…](https://testnet.nearblocks.io/txns/Rs8QhVruw6pGEbe117VDvdVZALRrB5MnB3VHqVLdNnD) |
| Deal loaded, every opening position sealed | [DXbQjGs4…](https://testnet.nearblocks.io/txns/DXbQjGs4qfPVSQZC89PHqJgFinAXHsNVYVPVZDHtEeP5) |
| View key: agent | [6GmvwekM…](https://testnet.nearblocks.io/txns/6GmvwekM6gvps8Fj9MUitFDSDSHjamdNyP1U2icZ2PKu) |
| View key: borrower | [9N2eGgNs…](https://testnet.nearblocks.io/txns/9N2eGgNsYqZp41rjFcRBgXSp8GfpxpLpjkf84qa3M5eG) |
| View key: Alder | [8ieEfYqQ…](https://testnet.nearblocks.io/txns/8ieEfYqQyqCvbRZEvr1f4rLjQM4dkwEA6aFTw6ns7UsX) |
| View key: Birch | [bumd63k6…](https://testnet.nearblocks.io/txns/bumd63k6gNbi6W4pgH3TboQoo8jZJ9CRimfBXYGUnex) |
| View key: Cedar | [9B8MZ4iu…](https://testnet.nearblocks.io/txns/9B8MZ4iuDvzTSCmJVHmPeN3iygqKjMbEARgo7iAev8qZ) |
| View key: Delta | [84JCwjQ4…](https://testnet.nearblocks.io/txns/84JCwjQ4dpCpz18sjJUk1UM8nmTq9kTRNoEbWrk7ZKEq) |
| View key: Rival | [9f5xSP5n…](https://testnet.nearblocks.io/txns/9f5xSP5nm1dFJWc8JbYsWKVH34szydyeifSyjaykvYk4) |
| View key: auditor | [Bz6xwVkU…](https://testnet.nearblocks.io/txns/Bz6xwVkUuUGo2zTTpfAxnYZNrnvtTbmrHfdJ26LUoTtp) |
| Agent fixes the rate, 4.30% + 3.50% | [8eFsakrW…](https://testnet.nearblocks.io/txns/8eFsakrWzbLhYAdrSyWpHcuZpT3Javk37c7QDhy3W58g) |
| Agent types 900,000,000.00: **refused** | [o36Pf9jk…](https://testnet.nearblocks.io/txns/o36Pf9jk2zAAGQ8sf8xLa4Edo7DHGAA2qgGT3Bb5P58) |
| Agent requests 1,971,666.66 | [3AVZW7vF…](https://testnet.nearblocks.io/txns/3AVZW7vFPf791Ro9vmaD1xdzv19wHQ2eEmjsJaXDg1ge) |
| Borrower pays 1,971,666.66, in one transfer | [MZM57dBE…](https://testnet.nearblocks.io/txns/MZM57dBEUMQ8NwzSzQ9HGCyahkDNXSzuAF6yyPARgU6) |
| Agent settles: three lenders paid in one step | [Dndv3Zvq…](https://testnet.nearblocks.io/txns/Dndv3ZvqtTQh8JktXri4mieVPf8fyq59woE9aguFzQ4U) |
| Alder withdraws 500,000.00 | [DBeuzbsp…](https://testnet.nearblocks.io/txns/DBeuzbspmtNBBQJzvWd6sU7aShpeCEZmGbSXELkD6TsP) |
| Agent fixes the rate for the second period | [F79WcoP4…](https://testnet.nearblocks.io/txns/F79WcoP4BR7brWT3KrJKn5qtrXKsvzZSbnDeKfPEVTL2) |
| Borrower sets its DQ list, sealed | [FD3fH8P4…](https://testnet.nearblocks.io/txns/FD3fH8P4kBwEFaR5rEhGHABo5f1suAvc1tQSHDir3pMz) |
| Rival pays 12,000,000.00 in | [94jmgeNd…](https://testnet.nearblocks.io/txns/94jmgeNdcjCUmQW2rtLCahNp78BfGHSApaqSmc6LYvJU) |
| Delta pays 12,000,000.00 in | [4fP1ujLA…](https://testnet.nearblocks.io/txns/4fP1ujLAvYyYUypyxceftk5rQL5rdc94DhLqrBLmdU8j) |
| Alder offers 10,000,000.00 to Rival, sealed | [AvRnAici…](https://testnet.nearblocks.io/txns/AvRnAicioifGTyfBwgGFT66vn8uscVspSiLXPuXpBUnh) |
| Rival accepts | [8goqZBoq…](https://testnet.nearblocks.io/txns/8goqZBoqALuvx7rFRTGAK43gPcFHAoLQDZjnRL1ZCywS) |
| Agent settles: **not settled**, Rival learns nothing | [D85FiUHa…](https://testnet.nearblocks.io/txns/D85FiUHaum7vGh1BCVzZ9TUqrPhC7mAw4U6SaF8ApCEi) |
| Alder offers 10,000,000.00 to Delta, sealed | [3DSb3h1M…](https://testnet.nearblocks.io/txns/3DSb3h1Mn6EDUiVhhmHsSTpgK3y99z5xF4WxfQzzeCCs) |
| Delta accepts | [ANZfHvFZ…](https://testnet.nearblocks.io/txns/ANZfHvFZF3CcWuLGBP988nq4F9EdurzdkthgDGXPPF8u) |
| Agent settles: cash against loan in one step | [CM8FBYGP…](https://testnet.nearblocks.io/txns/CM8FBYGPz3yjzo7A29zY3LpR9gbVJtVjC5gKz8rdnYKo) |
| Birch sends Alder's sealed offer as its own: **refused** | [C2rKHgyb…](https://testnet.nearblocks.io/txns/C2rKHgybrk4Ep3oFfyvW7gW3wSe8ENbFR1UdhXvqwqyJ) |
| Agent requests 1,950,000.00 for the second period | [7ZBPdr3u…](https://testnet.nearblocks.io/txns/7ZBPdr3u9Y47hM2ytvSQRnzwqdExzjCUFPVGBofB3J1i) |
| Borrower pays half of it, 975,000.00 | [FkfBEtXV…](https://testnet.nearblocks.io/txns/FkfBEtXVGRk9vPEMX81nEmMuXkSvQayGbPNUGQ7MSsVh) |
| Agent settles the short payment: four lenders each paid half | [DzXpdJXg…](https://testnet.nearblocks.io/txns/DzXpdJXgG1smPvSh2v8yift82bdLLhgADJPXdNSazRpm) |
| Agent fixes the rate for the third period | [6PL4aWvj…](https://testnet.nearblocks.io/txns/6PL4aWvjf4zYLVdkQFYaZFGo2CVGkXZVd49xw2kq9mqW) |
| Agent requests 2,968,333.32: the period's interest plus every unpaid half | [3K2fn7F5…](https://testnet.nearblocks.io/txns/3K2fn7F5WNtTDVd7pQ2YG9dDNY42KiCWJraAFwSAWJkJ) |
| Borrower pays all of it | [AEpeZmzf…](https://testnet.nearblocks.io/txns/AEpeZmzfygkKcgxuiihk6jieR4wACc2r9vCvayggjk4A) |
| Agent settles: every lender paid in full | [3CG5ocEE…](https://testnet.nearblocks.io/txns/3CG5ocEEnJTbp2c8FyNKA7YLHC5uefow85y9vQgSVzSz) |

The 62 transactions of `northwind-13` are in [`near/runs/northwind-13.json`](../../near/runs/northwind-13.json). Each of the agent's actions there is three transactions: operator 1 proposes, operator 1 approves, operator 2 approves and the action runs. The README's section "The agent as two of three" links the ones that matter.

### Earlier deals

Their transactions stay on the chain; their storage has been swept from the contract.

- `northwind-1` to `northwind-3`: earlier builds of the contract. The first browser acceptance was played on `northwind-3`.
- `northwind-4` (one agent key, 28 transactions) and `northwind-5` (the DAO, 44 transactions): the first recorded runs, on enclave build `4fd3ba96a54d17244166e32c41b9eda73cf6ed1a5323e22b9f5fa0bc4aafff9a`, before the short payment, the late-answer rule and the proofs. Their run logs were in the repository until the final runs replaced them.
- `northwind-6` to `northwind-8`: set up while the later features were being built (`northwind-6` was the deal for the two-of-three browser check). The scripts recorded their setup only.
- `northwind-9`: the first run of the short payment, the third period and the proofs, on enclave build `e3ea1f33d0258be343fb2cc40056fab020671f213045e8bd02aeebc3f4d7f115`. All green; 56 transactions, some of them resends from the end of the outage.
- `northwind-10` (the DAO, 61 transactions) and `northwind-11` (one agent key, 35 transactions): full green runs on that same build, replaced when the review found the two gaps above.
- `northwind-12`: started on build `7bb5f16c7ac6affea66bfde207ee7226a3220c2452adbd2509416b96fedb21fe`, which had the first fix only, and stopped during setup when the second gap was found.

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

Played in the same way afterwards:

- **The agent as two of three**, on deal `northwind-6`: operator 1 proposes and approves and nothing moves; **Approve as operator 2** runs the action; two operators approving 900,000,000.00 are refused.
- **The short payment and the period that pays the rest**, in the app, before the scripts played it.
- **Proofs, on the final build** (deal `northwind-14`, 2026-11-12, no transactions sent): on `/lender/alder` each of the three settled payments has a **Prove** button, and `/verify` reads **It holds** with the sentence for that payment (985,833.33 of 985,833.33 to 15 Dec 2026; 422,500.00 of 845,000.00 to 15 Mar 2027; 1,219,833.33 of 1,219,833.33 to 15 Jun 2027). One digit of `"paid"` changed in the box reads **It does not hold**: "The fact, its salt and the list of hashes do not belong together." **Prove what you hold** reads "Alder holds 40,000,000.00 of the loan" and the page shows no cash balance and no price; **Prove your cash** reads 12,078,166.66. `/agent`, `/auditor` and `/borrower` each prove the register and the outstanding total, 100,000,000.00. `/visibility` shows eight claims and all eight read **Holds**.
- **Every screen at 1440 pixels wide**, full page: no table is wider than its panel. One was: a lender's trades table cut its status off, and was fixed (the trade date now sits under the names, the action under the status).

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

**Spike 3: pass.** A Sputnik DAO with three council members called a contract, and the call ran only after the second approval.

- DAO `paridesk-agent.sputnikv2.testnet`, made by the factory `sputnikv2.testnet` (`create` with 6 NEAR attached): [9YwV12rD…](https://testnet.nearblocks.io/txns/9YwV12rDXnfTEFKSAJtFZWTfPVcKgg7CcppXB9QbtNgq). Council: `op1`, `op2`, `op3` under `paridesk.testnet`.
- The proposal, a `FunctionCall` to `spike.paridesk.testnet` with 250 TGas: [GFxXaDfj…](https://testnet.nearblocks.io/txns/GFxXaDfjPtY6nexs4dEAxrPDTGMuNb2vdo3q6wpCzzu7).
- First approval: [HmPjWc9R…](https://testnet.nearblocks.io/txns/HmPjWc9RGukFuSVUaS3RUfQsjPeHnXNMAji4zZvdyfi6). The proposal stayed `InProgress` with one vote of three, and the spike contract's count did not change.
- Second approval: [5QGeAqjn…](https://testnet.nearblocks.io/txns/5QGeAqjn2RTAyHJsHqQitYqwkRxPAqHXY3RWh5uxTEVC). The proposal became `Approved` and the same transaction ran the contract, the enclave and the callback (count 7). The enclave saw `predecessor = spike.paridesk.testnet` and `signer = op2.paridesk.testnet`.
- The DAO's default policy, as read from the chain: a 1 NEAR bond per proposal (returned when it passes), seven days to vote, and more than half of the council to pass, so two of three. `act_proposal` takes the proposal's kind as well as its id.

**Gotcha: FastFS.** `outlayer upload` can report success while the gateway never serves the file (first upload [J7sYWyuM…](https://testnet.nearblocks.io/txns/J7sYWyuMSnBeTpHv5SX23xBmpdSgPXkYdNqLnq8xuhu3) stayed 404 for 30+ minutes). Uploading the same bytes again ([B2HHDPiA…](https://testnet.nearblocks.io/txns/B2HHDPiAKGFjpP7dXAgJhJZqp1L6kcqwKxY5QvDz94Pk)) served within seconds. Always check the URL's sha256 before deploying a version.

Setup transactions: root account [G1ZSCUNe…](https://testnet.nearblocks.io/txns/G1ZSCUNefRpokiTrv38xHcvSUuucGY3LuhcL4A59NjqD), create_project [Adeiu9uj…](https://testnet.nearblocks.io/txns/Adeiu9ujRRR91eaHuyrpGtJJ2JUadmTL8RqGmJjU9VvQ), spike account [4xQky8eW…](https://testnet.nearblocks.io/txns/4xQky8eWpuBw9CgqP3ceEJzcZXnvYKGEe4BcG6ocTPMo), spike deploy [Dw1tMpyo…](https://testnet.nearblocks.io/txns/Dw1tMpyow6SBXFD34QhRV4frPP6ujnabQJrZ2A3Ucjmf).

## Cut

- **The brief's cut list**, as planned: prepayment, MNPI documents and the information wall, the 100-lender scale test, Confidential Intents withdrawals, an AI agent, mainnet, Canton Coin.
- **No hosted NEAR demo yet.** `near/Dockerfile` and `npm run demo:env` are ready. The same standalone server was run locally with that env file and no other keys; the Docker image build itself has not been run.
- **The `/docs` pages still describe the Canton build.** In NEAR mode they carry a notice that says so and points to the README. The home page and the app screens switch with `PARI_BACKEND=near`.
- **The enclave build is not bit-for-bit reproducible across machines.** The contract pins the sha256 of the build that was uploaded.

## The repository's history (12 November)

At the builder's request the history was rebuilt on 12 November 2026, and `main` on GitHub was replaced with it the same day. `main` now holds one commit with the Canton build as it stood on 7 October 2026 (`392e45c`, tag `pre-hackathon`), then the commits made during the hackathon, each with its original message, author and date. The files are the same as before the rebuild. The `near` branch is gone, and the README's Canton half moved to `docs/canton.md`, so the README is the NEAR build alone with its disclosure and diff link.

## Next (the builder's steps)

Nothing is left to build, and `main` is public. These need the builder, in this order:

1. Record the demo video against a fresh deal (`npm run setup -- --fresh`, about three minutes), while OutLayer is answering in seconds, and add its link at the top of the README. A fresh deal replaces `northwind-14` as the live one; the two recorded runs and their checks are not affected.
2. Optional: host the NEAR demo, and keep it up through 2026-11-18.
3. Add a line naming Pari to Selkie's README.
4. Tag the final commit `hackathon-submission`, post on X, then submit the form, before 2026-11-14T23:59:00Z.

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
- **Contract storage has to stay small to be read in one call.** A deal played through one period measured 16,042 bytes in 43 keys. Played through all three periods, with a commitment beside every envelope, it measures about 65,000 bytes in 51 keys, and the public RPC still returns it in one `view_state` call. The contract's `sweep` removes ended deals, so storage holds one deal at a time.
- **Next.js 14 keeps the answers to chain reads.** Its data cache stored near-api-js's RPC POST responses for a year, even on pages marked `force-dynamic`, so a screen could show an old deal. Fixed with `export const fetchCache = "force-no-store"` in `web/app/(app)/layout.tsx`.
- **near-api-js 7.5.3 does not retry a dropped connection.** It retries HTTP 500, 503 and 408 only; Node's `TypeError: fetch failed` stops the script. The scripts wrap `fetch` with six attempts.
- **The public RPC rate-limits, and near-api-js 7.5.3 does not retry that either.** `rpc.testnet.fastnear.com` answers HTTP 429, "Rate limits exceeded", after a long run of calls from one address. It first stopped the leak test, then an approval in the browser. The scripts' `fetch` wrapper and the web's provider now send the same request again after 2, 4, 8, 16 and 32 seconds. Re-sending is safe: a read changes nothing and a signed transaction has one hash.
- **OutLayer's testnet latency varies a lot.** From the contract's request to the enclave's answer took 6 to 16 seconds in the afternoon of 2026-11-11 and 60 to 80 seconds that evening (measured on chain for [HngFH8DD…](https://testnet.nearblocks.io/txns/HngFH8DDRjEnUtnysZ55m8hpo7LtNLiHGJNK9JpyTJku), [5k4xjCJF…](https://testnet.nearblocks.io/txns/5k4xjCJFgqDnBVmEAkVgfH45k5QvKWTMCpyukWQ6zTaA) and [5WqP6fyj…](https://testnet.nearblocks.io/txns/5WqP6fyjXJ7zZWEwvpo1wGE7qu9SDbnMTryZNUh5eQGM)). Nothing in Pari changed between the two; record the video when it is fast.
- **Sputnik DAO on testnet, read from the chain.** Factory `sputnikv2.testnet`. `get_last_proposal_id` returns the number of proposals, which is the next id. `get_proposals({from_index, limit})` returns each proposal's `status` (`InProgress`, `Approved`), `votes` by account and `kind`. The rules contract's methods take no deposit, so a proposal's action carries deposit 0 and 250 TGas, which was enough for every agent action.
- **A DAO's proposals are public.** Their arguments are the rate, the total, and the number of a request or a trade: nothing sealed. The leak test reads the DAO's transactions like any others.
- **Reading the chain as it was.** near-api-js 7.5.3: `provider.callFunctionRaw({ contractId, method, args, blockQuery: { blockId } })` on the archival node `https://archival-rpc.testnet.fastnear.com` returns a view call's answer at an old block, and `provider.viewBlock({ blockId })` its time (`header.timestamp_nanosec`). A block that had just become final was already there in three tries of three (0.4 to 2 seconds). A block the node does not know raises `UnknownBlockError`; the proof checkers try three times before saying the archive could not be asked.
- **A recorded run outlives the contract's current deal.** The leak test compared each run's attested build with the build the contract pins now, so it failed on the recorded runs as soon as the contract moved to a new enclave build. It now reads the build from the public arguments of the deal's own first transaction (`new`).
- **OutLayer, from its docs and source, read on 2026-11-11.** Limits per run: `max_instructions` 1 billion by default and 500 billion at most, `max_memory_mb` 128 and 4,096, `max_execution_seconds` 60 and 180. The docs name no priority option and no queue-status endpoint. Views on the contract (`contract/src/views.rs`): `is_paused()`, `get_stats()` (total executions, total fees), `get_request(request_id)`, `get_pending_request_ids(from_index, limit)`. On testnet at 21:53 UTC `is_paused` returned `false` and `get_pending_request_ids` ran out of gas as a view call, even with a limit of 3. Mainnet, not used by Pari: contract `outlayer.near`, API `https://api.outlayer.ai`.
- **near-api-js 7.5.3 declares Node 22.22.2 or later** but ran correctly here on Node 20.20.2, 22.16.0 and 22.23.2 (a view call, key generation, libsodium).
- **The submission form** (`POST https://nearhackathon.com/api/applications`): the exact fields are in `SUBMISSION.md`. The X post is the `demoUrl`.
