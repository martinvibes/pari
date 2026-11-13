<div align="center">

<br/>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg" />
  <img src="docs/assets/logo-light.svg" alt="Pari logo" width="96" height="96" />
</picture>

<h1>pari</h1>

**A syndicated loan's books on NEAR. Each party sees only its own.**

The rules run in a NEAR contract. The books run inside an Intel TDX enclave.<br/>
The public chain sees one total and a fingerprint, and a mistyped $900M payment is refused.

[![tests](https://img.shields.io/badge/Rust%20tests-54%20passing-3DDC97.svg)](#tests)
[![NEAR](https://img.shields.io/badge/NEAR-testnet-00EC97.svg)](https://testnet.nearblocks.io/address/ledger.paridesk.testnet)
[![enclave](https://img.shields.io/badge/OutLayer-Intel%20TDX-A78BFA.svg)](#how-it-works)
[![hackathon](https://img.shields.io/badge/NEAR%20HACKATHON-privacy%20%C2%B7%20realworld-FFC857.svg)](#near-hackathon)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

[Live demo](https://pari-web-production-5ff7e57a.up.railway.app) · [Check it in five minutes](#check-it-yourself) · [The leak test](#the-leak-test) · [Prove one fact](#prove-one-fact-and-nothing-else) · [Contract on testnet](https://testnet.nearblocks.io/address/ledger.paridesk.testnet) · [Trust model](#trust-model) · [The earlier Canton build](docs/canton.md)

</div>

---

## The problem

In 2020 Citibank, as the administrative agent on Revlon's loan, meant to pay about $7.8M of interest and wired about $900M of its own money instead. Loan agency still runs on email, PDFs and spreadsheets.

A public blockchain can't hold a loan's books either. It would publish every lender's position, every trade price and the borrower's list of banned buyers (the DQ list).

## What Pari does

Pari keeps the administrative agent's books for a syndicated loan:

- every lender is paid in one step, to the cent;
- a short payment is shared pro rata, and the unpaid part is paid with the next period;
- a trade settles cash against loan in one step, or not at all;
- each party sees only what it is entitled to;
- a party can [prove one fact](#prove-one-fact-and-nothing-else) from its own view to anyone, and show nothing else;
- the agent can't overpay anyone, and the agent can be [two of three operators](#the-agent-as-two-of-three).

On NEAR, those books are two programs that check each other.

| | Where it runs | What it does |
|---|---|---|
| **The rules contract** | [`ledger.paridesk.testnet`](https://testnet.nearblocks.io/address/ledger.paridesk.testnet), source in [`near/contract`](near/contract/src) | Checks who may do what, runs one action at a time, holds the test USDC and caps every payout. |
| **The books** (`pari-core`) | An Intel TDX enclave on [OutLayer](https://outlayer.ai), source in [`near/enclave`](near/enclave/src) | Keeps positions, cash, trade prices and the DQ list in encrypted storage, and applies the deal's rules. |

After every action the enclave hands back a **fingerprint** of the new books (a sha256, with 32 fresh random bytes hashed in) and, for each party, one **sealed envelope**, encrypted so only that party can open it, and one **commitment**: a salted hash of the facts inside that envelope. The contract stores all three. The public chain sees rules, totals, fingerprints and hashes. Each party opens its own envelope and sees its own slice, and can use the commitment to [prove one fact](#prove-one-fact-and-nothing-else) from it.

## How it works

```
 a party                  the rules contract                   the books (pari-core)
 signs a NEAR tx          ledger.paridesk.testnet              Intel TDX enclave on OutLayer
      │                          │                                      │
      │  request_interest        │                                      │
      │  (the total it typed)    │                                      │
      ├─────────────────────────▶│ 1. is the caller the agent?          │
      │                          │ 2. one action at a time (a lock)     │
      │                          │ 3. run the one pinned build, and     │
      │                          │    tell it who called                │
      │                          ├─────────────────────────────────────▶│ 4. open the books from
      │                          │                                      │    encrypted storage
      │                          │                                      │ 5. apply the deal's rules,
      │                          │                                      │    or refuse
      │                          │  new fingerprint, public totals,     │ 6. save the books; seal one
      │                          │  one sealed envelope and one         │    envelope per party and
      │                          │  commitment per party                │    hash the facts in it
      │                          │◀─────────────────────────────────────┤
      │                          │ 7. check the money rules again,      │
      │                          │    without trusting the enclave      │
      │                          │ 8. store fingerprint, envelopes      │
      │                          │    and commitments                   │
      │   done, or refused       │ 9. pay out test USDC (withdrawals)   │
      │◀─────────────────────────┤                                      │
```

Steps 3 to 6 are one NEAR transaction: the contract calls OutLayer, waits (NEAR's yield/resume), and gets the answer in a callback.

**Two guards stand between a typo and the money.**

1. *The enclave enforces the deal.* The agent types the total it means to request. The enclave works the total out from the register, and if the two differ it refuses and says so: "You entered 900,000,000.00; the register says 1,971,666.66."
2. *The contract enforces the money.* It never lets lenders be credited more than the borrower paid in for that request, and never pays out more test USDC than it holds for the deal. It checks this itself on every answer. If an answer ever broke a money rule, the contract would freeze the deal instead of paying.

**Secrets never touch the chain in the clear.** Anything secret a party sends (a trade's buyer, size and price; the DQ list; the opening positions) is sealed to the enclave's public key before it goes into a transaction. Lender payments are credits inside the books, not token transfers, so no per-lender amount ever appears on chain.

**A sealed box is no use to anyone but its sender.** The ciphertext sits on the public chain, where anyone can copy it. If the enclave took it from any caller, Birch could send Alder's sealed offer as its own and read the buyer, the size and the price in its own envelope. So the sealed fields name the deal, the caller and the command they are for, and the enclave refuses a box that arrives any other way (`test_a_sealed_offer_copied_from_the_chain_is_no_use_to_anyone_else`). `npm run e2e` plays exactly that on testnet: Birch sends Alder's box and is refused.

**A fingerprint confirms no guess.** Loan positions are round numbers, and a plain hash of the books would let anyone try "Alder 50 million, Birch 30, Cedar 20" and compare. So the books carry 32 random bytes that the enclave draws again with every answer. They are part of the fingerprint and appear in no envelope and nowhere on the chain. Two deals that hold the same books, to the cent, show different fingerprints (`test_a_fingerprint_confirms_no_guess_at_the_books`). Each party's commitment is salted the same way, from a seed inside its own envelope.

**An answer that comes late counts for nothing.** NEAR lets a contract wait about two minutes for the enclave. If no answer comes, the contract records "the enclave did not answer; nothing changed", releases the lock and gives back any tokens sent with the action. The contract numbers every request and names the fingerprint it holds. The enclave builds only on the books with that fingerprint, and refuses a request with an older number than one it has already answered. So an enclave run that finishes after the wait changes nothing, and the action can simply be sent again. The scripts do that by themselves, up to four times; the app says what happened and asks you to press the button again.

## Check it yourself

Three ways, cheapest first.

### 1. With no account and no keys (about five minutes)

You need [Rust](https://rustup.rs) and Node.js 22.

```bash
git clone https://github.com/martinvibes/pari && cd pari

(cd near/enclave && cargo test)     # the deal's rules, with the deal's numbers
(cd near/contract && cargo test)    # roles, the lock, the money caps

cd near/scripts && npm install
npm run prove:privacy               # reads NEAR testnet; needs no key
npm run verify:proof                # checks one fact from a sealed view; needs no key
```

You should see:

- `cargo test` in `near/enclave`: 28 tests pass (five files: 3, 5, 4, 11 and 5).
- `cargo test` in `near/contract`: `26 passed`.
- `npm run prove:privacy` ends with `PASS: 0 secrets in … bytes of public data.` Its full output is under [The leak test](#the-leak-test).
- `npm run verify:proof` ends with `PASS: the fact is what the enclave put in this party's view, and the proof shows no other.` Its full output is under [Prove one fact, and nothing else](#prove-one-fact-and-nothing-else).

The leak test downloads every transaction of a recorded run of the deal, plus the contract's whole storage, straight from NEAR testnet, and searches them for each lender's position, each payment, the trade's size and price, and the DQ list. The proof check takes the proof that run left in `near/proofs` (Alder showing what it holds of the loan) and asks NEAR whether the contract held its commitment at the proof's block.

The scripts and the app read NEAR through a free public RPC. When it answers `Rate limits exceeded` they wait and try again, so a step can pause, for up to four minutes after a long run of reads. To use another RPC, set `NEAR_RPC_URL` (and `NEAR_ARCHIVAL_RPC_URL`, which the leak test reads old transactions from) to one from [docs.near.org/api/rpc/providers](https://docs.near.org/api/rpc/providers).

You can also read the live deal as the public does, in the app, with no keys:

```bash
cd web && npm install
PARI_BACKEND=near npm run dev       # then open http://localhost:3000/visibility
```

You should see the page titled **Who sees what** with a panel **You are reading as the public**: the contract's facts, one total per interest request, the record of every action, and eight sealed envelopes that this server cannot open, each beside its commitment.

### 2. Play the deal in the browser

This needs the demo's keys. The [hosted demo](https://pari-web-production-5ff7e57a.up.railway.app) holds them and plays the builder's live deal on NEAR testnet; it is wherever the last visitor left it, so its numbers differ from the ones below. For the exact walk, use [your own deployment](#3-your-own-deployment-on-testnet). Each action usually takes 10 to 30 seconds on testnet, because the contract waits for the enclave. When OutLayer's testnet workers are busy it can take a minute or more (measured on 11 November 2026: 6 to 16 seconds in the afternoon, 60 to 80 in the evening, and for about an hour that night [no answer at all](docs/hackathon/PROGRESS.md#the-outlayer-outage-of-11-november)). If the enclave misses NEAR's two-minute wait, the app says *The enclave did not answer within NEAR's two-minute wait. Press it again: an answer that comes late counts for nothing.* Nothing has changed when you see that, so press the button again.

The numbers below are for a fresh deal. Every screen is one party's own view: pick the party in the top bar.

**Interest, and the Revlon mistake**

1. Open `/agent`. Under **Next interest period**, press **Fix rate**.
   You see: *Base rate fixed at 4.30% to 15 Dec 2026. All-in 7.80%.*
2. Under **Request interest**, replace the total with `900,000,000.00` and press **Request interest**.
   You see: **Refused**. *You entered 900,000,000.00; the register says 1,971,666.66. Nothing changed: the books and the money are as they were.*
3. Type `1,971,666.66` (a reload prefills it) and press **Request interest**.
   You see: *Interest requested: 1,971,666.66. The chain shows the total; each lender's share stays sealed.*
4. Open `/borrower` and press **Pay**.
   You see: *Paid 1,971,666.66 of test USDC into the deal.*
5. Back on `/agent`, press **Settle all 3 lenders**.
   You see: *Settled. Every lender was credited in one step. The chain shows one total, 1,971,666.66, and no lender's share.*
6. Open `/lender/alder`. You see Alder was paid **985,833.33**, and nothing about Birch or Cedar.
   `/lender/birch` shows **591,500.00** and `/lender/cedar` shows **394,333.33**. `/auditor` shows all three.
7. Open `/visibility`. The **Public chain** column has one payment total and no register line, payment leg, trade price or DQ list. Under **The public chain** you see the total 1,971,666.66, the books' fingerprint, eight sealed envelopes, and the refusal from step 2 on the public record. Under **Checked live**, eight claims read **Holds**.

**A trade, screened against a list the buyer never sees**

8. On `/agent`, press **Fix rate** again (the next period, to 15 Mar 2027).
9. On `/borrower`, under the DQ list, tick **Rival** and press **Save DQ list**.
   You see: *DQ list updated. It went to the enclave sealed: the chain carries only ciphertext.*
10. On `/lender/rival` press **Pay in**, then the same on `/lender/delta` (12,000,000.00 of test USDC each).
11. On `/lender/alder`, under **Sell part of your position**, choose **Rival** and press **Offer trade**. On `/lender/rival` press **Accept**. On `/agent` press **Settle**.
    You see: *Not settled. Nothing moved, and the buyer is told nothing more.* Rival's screen says *not settled* and gives no reason. The agent's screen says *The buyer is on the DQ list.*
12. Do the same with **Delta** as the buyer.
    You see: *Trade settled. Cash, register and both positions moved in one step.* Delta holds 10,000,000.00 and paid 9,950,000.00. Alder holds 40,000,000.00 with 845,000.00 of interest due at period end: 780,000.00 on what it kept, plus the 65,000.00 it earned on the part it sold, up to the trade date. `/borrower` shows the trade and no price.

**A short payment, and the period that pays the rest**

13. On `/agent`, press **Request interest**. The form is prefilled with `1,950,000.00`, the second period's interest for the four lenders.
14. On `/borrower`, replace the amount with `975,000.00` and press **Pay**.
    You see: *Paid 975,000.00 of test USDC into the deal.*
15. On `/agent`, press **Settle the short payment pro rata**.
    You see: *Settled. Every lender was credited in one step. The chain shows one total, 975,000.00, and no lender's share.* Every lender was paid the same half of what it was owed. `/lender/alder` shows 422,500.00 paid of 845,000.00 due, and the other half still owed. Birch got 292,500.00, Cedar 195,000.00 and Delta 65,000.00, each on its own screen only.
16. On `/agent`, press **Fix rate** (the third period, to 15 Jun 2027). The request form now reads `2,968,333.32`: the third period's interest plus every unpaid half. Press **Request interest**, then **Pay** on `/borrower`, then **Settle all 4 lenders** on `/agent`.
    `/lender/alder` shows **1,219,833.33** paid, and nothing left owed from the short period.

**With an account only you control**

17. Open `/you` (**Use your own account**, in the status line). Sign in with Privy, or press **Use a key made in this browser**.
    You see: a NEAR testnet account named by a key. The demo server never holds that key.
18. Press the six buttons in order: **Get test funds**, **Register view key**, **Pay in**, **Ask Alder for an offer**, **Accept**, **Ask the agent to settle**. Each step says whose account signs it. The faucet, Alder and the agent sign on the demo server. Your three are signed in your browser and sent to NEAR from there.
    You see: *Trade settled. Your cash went to Alder and the loan came to you in one step.* You hold 250,000.00 of the loan, bought at 99.50 for 248,750.00, with 1,250.00 of cash left in the books. **What the chain holds about you** shows your envelope as ciphertext. **What you alone can open** shows the same envelope, opened in your browser with a view key that never leaves it.

If no interest period is open, the agent fixes one (4.30%, three months) before it settles your trade. Privy sign-in appears when the deployment has a Privy app id (`NEXT_PUBLIC_PRIVY_APP_ID` in `web/.env.local`); without one the page offers the browser key alone.

### 3. Your own deployment on testnet

About ten minutes. You need Rust, [cargo-near](https://github.com/near/cargo-near), the [near CLI](https://github.com/near/near-cli-rs), Node.js 22, and a testnet account holding about 18 NEAR whose key is in `~/.near-credentials/testnet/`.

```bash
# a new testnet account, funded by the faucet, with its key saved where the scripts look
near account create-account sponsor-by-faucet-service YOU.testnet \
  autogenerate-new-keypair save-to-legacy-keychain network-config testnet create

export PARI_ROOT=YOU.testnet
cd near && ./build.sh                 # the contract, the test USDC and the enclave program
cd scripts && npm install
npm run setup                         # accounts, contracts, the enclave build, the sealed deal
npm run e2e                           # plays the whole deal and checks every figure
npm run prove:privacy                 # the leak test, on the run you just made
cd ../../web && npm install
PARI_BACKEND=near npm run dev         # http://localhost:3000/agent
```

The `/you` page gives each new account 0.5 test NEAR for gas from your root account (`PARI_FAUCET` names another account, `NEAR_KEY_FAUCET` its key), and stops after 20 accounts per run of the server.

`npm run setup` is safe to run again: every step checks the chain first and does only what is missing. `npm run setup -- --fresh` starts a new deal with new books. The faucet starts a new account with 10 NEAR, so top it up before running setup: from [near-faucet.io](https://near-faucet.io), or make a second faucet account the same way and send its balance over (`near tokens OTHER.testnet send-near YOU.testnet '9.5 NEAR' network-config testnet sign-with-legacy-keychain send`).

`npm run e2e` ends with `All green.` and the books' fingerprint. It plays the interest payment (with the mistyped total refused), a withdrawal, the DQ list, Rival's refused trade and Delta's settled one, Birch's attempt to reuse Alder's sealed offer, then a short payment and the period that pays the rest, and checks each party's envelope after every step.

## The agent as two of three

A real agent desk does not act on one person's word, and on a chain it should not act on one key. On NEAR an account can be a contract, so the deal's agent can be a [Sputnik DAO](https://github.com/near-daos/sputnik-dao-contract) with three operators, of whom two must approve. Nothing in the rules contract or the enclave changes for this: the contract checks that the caller is the deal's agent, and the agent is the DAO.

- Each of the agent's actions (fix the rate, request interest, settle a payment, settle a trade) is a DAO proposal to call the rules contract.
- **Operator 1 proposes and approves. Nothing moves.** The books' fingerprint stays the same and no lender is paid.
- **A second operator approves, and it settles.** That one transaction runs DAO → rules contract → enclave and back, and credits every lender.
- **Approval does not replace the rule.** At Citibank three people approved the Revlon wire, under the bank's "six-eye" check, and it still went out. Here two operators can approve a request for 900,000,000.00 and the enclave still refuses it.

The recorded run of deal `northwind-13` is the whole deal played this way, by [`paridesk-agent.sputnikv2.testnet`](https://testnet.nearblocks.io/address/paridesk-agent.sputnikv2.testnet) with operators `op1`, `op2` and `op3`:

| Step of deal `northwind-13` | Transaction |
|---|---|
| Operator 1 proposes a request for 900,000,000.00, and approves it | [`FwiTj2ao…`](https://testnet.nearblocks.io/txns/FwiTj2aoitx3Pznvysotv7FrTfA967RiK2xNuiMKpGRn), [`GWDL9Dyr…`](https://testnet.nearblocks.io/txns/GWDL9DyrusDDtP858sA8mdDpjSMvDFYSXM4Ha61oZZpw) |
| Operator 2 approves it too: the enclave still refuses | [`Dubr3TBc…`](https://testnet.nearblocks.io/txns/Dubr3TBc9sQGM9xBwzASpMQqY4aZiQpRwoVU45CMHQux) |
| Operator 1 proposes the settlement | [`DV7rjHqd…`](https://testnet.nearblocks.io/txns/DV7rjHqd5UgJwwQQLqRudzEpc7tDHo7N3v65kC9XDko9) |
| Operator 1 approves: nothing moves | [`GcGWLS8L…`](https://testnet.nearblocks.io/txns/GcGWLS8LUHRo3d4LXkVe2nnyzY87Vi3qm1pUSuhgM89L) |
| Operator 2 approves: that transaction pays three lenders | [`3zDwMAgB…`](https://testnet.nearblocks.io/txns/3zDwMAgBqobDbDhi1hBdLVVEvtvXcaHjHbz2UvBNqjcF) |
| Two operators settle the short payment: four lenders are each paid half | [`EgCyUC3e…`](https://testnet.nearblocks.io/txns/EgCyUC3eq6g9BmMkVqWzYTpeUGyjDDPT3GT7CaMHZ1sb), [`8CgtGPkL…`](https://testnet.nearblocks.io/txns/8CgtGPkLJnt18UB1UH6fiShKf4YyBHXtcBsfJupC2ppF), [`whwMQ8ae…`](https://testnet.nearblocks.io/txns/whwMQ8ae8EugEW499599KhK61rwDdwCzVNFmLBdUhc6) |
| Two operators settle the next period: every unpaid half is paid | [`42HB29Km…`](https://testnet.nearblocks.io/txns/42HB29KmFpaEjaU2KkZSHGpEMqyZhctZLjBJ6dAb7qwH), [`3QZrUvKQ…`](https://testnet.nearblocks.io/txns/3QZrUvKQWR322sCJgT2CqJo2MMsPP53kv4Fo5PRrMDMv), [`7Vcf7jDE…`](https://testnet.nearblocks.io/txns/7Vcf7jDEXZ5fL7oGXj2pEQwUziqmjCMSM179PUSBLsMR) |

All 62 transactions are in [`near/runs/northwind-13.json`](near/runs/northwind-13.json), and `npm run prove:privacy -- northwind-13` runs the leak test on them.

To play it yourself on [your own deployment](#3-your-own-deployment-on-testnet):

```bash
npm run setup -- --fresh --dao        # makes the DAO and a new deal whose agent is the DAO
npm run e2e                           # the same deal; every agent action takes two operators
```

`--dao` needs about 11 NEAR more than the plain setup: 6 to create the DAO, and 1.5 for each operator, which covers the 1 NEAR bond the DAO holds while a proposal waits. In the browser, on a deal made with `--dao`:

1. Open `/agent`. A panel **Two of three** names the DAO. Press **Fix rate**.
   You see: *Proposed, and approved by operator 1 of 3. Nothing has moved: proposal 1 runs when a second operator approves it.* (The number counts the DAO's proposals, so yours may differ.) The panel lists the proposal, and the rate still reads *Not fixed*.
2. In the panel, press **Approve as operator 2**.
   You see: *Two of three operators approved, so the agent acted. Base rate fixed at 4.30% to 15 Dec 2026. All-in 7.80%.*
3. Request `900,000,000.00`, then press **Approve as operator 3**.
   You see: **Refused**. *You entered 900,000,000.00; the register says 1,971,666.66.*

Every other step of [Play the deal in the browser](#2-play-the-deal-in-the-browser) works the same way, with one more press for each of the agent's actions.

A proposal's arguments are public, as everything in a DAO is: the rate, the total, the number of a request or a trade. None of them is a secret, and the rules contract's own record shows the same figures. The leak test passes on the DAO run as well.

## What each party sees

| Reader | Sees | Never sees |
|---|---|---|
| **Agent** | The whole register, every payment leg, every trade with its price, and whether a buyer passed screening | The DQ list itself |
| **Borrower** | The register, every payment, every trade (seller, buyer, size, date), its own DQ list | Trade prices |
| **Each lender** | Its own position, its own payments and cash, its own trades with their prices | Any other lender's position or payment, the register, the DQ list |
| **A buyer** | Its own trades, and its position once it has bought in | The DQ list. A refused buyer is told "not settled" and no reason |
| **Auditor** | The register through every payment and trade, with figures it can recompute | Trade prices, the DQ list |
| **The public chain** | The facility's name, the agent's and the borrower's accounts, which accounts take part, one total per interest request, how much was paid in and credited, every deposit and withdrawal, who sent each action, fingerprints, and envelope ciphertext | Positions, per-lender payments, trade sizes and prices, the DQ list, why a trade failed |

The last row is the honest one. [Trust model](#trust-model) lists everything the chain shows, including what a careful reader could infer.

## The leak test

`npm run prove:privacy` in `near/scripts`. It needs no keys. This is its output from a fresh clone, on the recorded run of deal `northwind-14`. Lines that say the RPC is rate limiting and the script is trying again are left out. The storage figures change with the live deal.

```
$ npm run prove:privacy

Leak test: deal northwind-14 on ledger.paridesk.testnet

Reading what anyone can read
  36 transactions: arguments, logs, receipts, return values  2,150,931 bytes
  the contract's whole storage: 51 keys                      65,450 bytes
  left out: the network's own gas and fee figures            1358 fields

Secrets searched for, in every way they could be written
  Alder's position: 50,000,000.00                            not found
  Birch's position: 30,000,000.00                            not found
  Cedar's position: 20,000,000.00                            not found
  Alder's interest payment: 985,833.33                       not found
  Birch's interest payment: 591,500.00                       not found
  Cedar's interest payment: 394,333.33                       not found
  the size of the trade: 10,000,000.00                       not found
  Alder's position after the trade: 40,000,000.00            not found
  the cash Delta paid Alder: 9,950,000.00                    not found
  the trade price: 99.5                                      not found
  the interest Alder kept on the trade date: 325,000.00      not found
  Alder's cash after its withdrawal: 485,833.33              not found
  Alder's cash after the trade: 10,435,833.33                not found
  Delta's cash after the trade: 2,050,000.00                 not found
  Alder's second-period interest: 845,000.00                 not found
  Birch's second-period interest: 585,000.00                 not found
  Cedar's second-period interest: 390,000.00                 not found
  Delta's second-period interest: 130,000.00                 not found
  the half of it Alder was paid: 422,500.00                  not found
  the half of it Birch was paid: 292,500.00                  not found
  the half of it Cedar was paid: 195,000.00                  not found
  the half of it Delta was paid: 65,000.00                   not found
  Alder's third-period payment: 1,219,833.33                 not found
  Birch's third-period payment: 890,500.00                   not found
  Cedar's third-period payment: 593,666.66                   not found
  Delta's third-period payment: 264,333.33                   not found
  Alder's cash at the end: 12,078,166.66                     not found
  Delta's cash at the end: 2,379,333.33                      not found
  the DQ list and screening results, by name                 not found
  Rival in the DQ transaction, beyond its envelope slot      not found (Rival 2, Delta 2)

Public by design: the same search does find these
  the interest request's total: 1,971,666.66                 found 39 times
  the short payment: 975,000.00                              found 24 times
  each buyer's deposit: 12,000,000.00                        found 28 times
  Alder's withdrawal: 500,000.00                             found 16 times
  who takes part (accounts)                                  found 544 times

Control skipped: the parties' view keys are not on this machine (they never leave the demo server).

The enclave
  program on OutLayer                                        paridesk.testnet/pari-core
  the one build this deal's contract would run (sha256)      edef73c7a53ee924982553f96886efab8bc2cb1d000d51e74f9026118d0c705d
  runs with an Intel TDX attestation from OutLayer           34 of 36 transactions
  of those, runs of any other build or program               none
  example                                                    https://testnet-api.outlayer.ai/attestations/by-tx/3CG5ocEEnJTbp2c8FyNKA7YLHC5uefow85y9vQgSVzSz
    TDX quote                                                5006 bytes, worker measurement 528235764e42c8ec…
    transaction                                              https://testnet.nearblocks.io/txns/3CG5ocEEnJTbp2c8FyNKA7YLHC5uefow85y9vQgSVzSz

PASS: 0 secrets in 2,216,417 bytes of public data.
```

How to read it:

- **Reading what anyone can read.** Every transaction of the run (arguments, logs, receipts, return values) and the contract's whole storage, fetched from public NEAR nodes. Base64 is decoded before searching.
- **Secrets searched for.** Each figure is searched for as a whole number in every way it could be written (cents, dollars with and without commas, token base units). The network's own gas and fee fields are left out, because on testnet the gas price happens to equal one of the deal's figures.
- **Public by design.** The same search does find the things Pari publishes on purpose, which shows the search works.
- **Control.** On a machine that holds the parties' keys, and while the recorded deal is still the live one, the test opens the envelopes and finds every secret inside them. So the secrets are in the data; they are just sealed. On the builder's machine it found 24 of 24; five more figures are from earlier in the deal and no longer in the books (Alder's opening position, for one). Without the keys, or once the contract has moved on to a later deal, this part prints `Control skipped`, and the rest runs the same.
- **The enclave.** A deal pins one build of the enclave program by its sha256, named in the public arguments of the transaction that starts the deal. The test reads it from there. Each run of the enclave comes with an Intel TDX attestation from OutLayer, which you can fetch by transaction hash, and the test fails if any of them names another build or program. The two transactions of this run that never reach the enclave are the contract's own setup calls. On the DAO run, `northwind-13`, it is 34 of 62: the rest are the DAO's proposals and its first approvals.

## Prove one fact, and nothing else

A lender sometimes has to show an outsider one thing from the books. A buyer wants to know the seller holds what it is selling. A fund's auditor wants to see one interest payment. A bank that lends against a position wants to see the position. Today that is a PDF from the agent. On a private ledger it usually means giving the outsider a seat on the ledger.

In Pari the party cuts a **proof** from its own envelope and hands it over as a link or a small file. The outsider checks it against NEAR with no key and no account. The agent is not asked, and nothing else in the envelope is shown.

**How it works**

1. Inside the enclave, each party's view is a list of facts: what it holds, its cash, each payment, each trade. For the agent, the borrower and the auditor the list also has the register and the outstanding total.
2. With every action the enclave draws 32 new random bytes for each party, the seed, and puts them inside that party's sealed envelope. Each fact gets its own salt, HMAC-SHA256 of the fact's name under the seed, and is hashed with it (sha256). The sha256 of all those hashes together is the party's **commitment**. The contract stores it beside the envelope, where anyone can read it.
3. A proof is one fact in the clear, its salt, the list of fact hashes and the number of the block it was cut at.
4. To check it, hash the fact with its salt and find the result at its place in the list. Then hash the list and ask a NEAR archival node what `envelope(party)` returned at that block. The two commitments must be equal.

The check reads the chain as it was at the proof's block, so a proof stays checkable after the deal has moved on. The page says whether it is still the party's latest view.

**Try it**, on [your own deployment](#3-your-own-deployment-on-testnet), after step 6 of [Play the deal in the browser](#2-play-the-deal-in-the-browser):

1. Open `/lender/alder`. In the payments table, press **Prove** beside the settled payment.
   You land on `/verify` and see **It holds**: *Alder was paid 985,833.33 of the 985,833.33 it was owed for interest to 15 Dec 2026.* Under **How it was checked** are the two steps above, with the block and the commitment. The page's address is the proof: anyone you send it to sees the same page, and the server uses no key to draw it.
2. In the box **The proof**, change one digit of `"paid"` and press **Check against NEAR**.
   You see **It does not hold**: *The fact, its salt and the list of hashes do not belong together.*
3. Back on `/lender/alder`, under the sealed envelope, **Prove what you hold** and **Prove your cash** do the same for those two facts. `/agent`, `/borrower` and `/auditor` have **Prove the register** and **Prove the outstanding total**.
4. In a terminal, `npm run e2e` leaves the proof of what Alder holds in `near/proofs`, and `npm run verify:proof` checks it with no keys. It then changes one digit and shows the proof rejected, and forges the changed fact's hash into the list and shows the chain's commitment reject that too.

This is `npm run verify:proof` from a fresh clone, with no keys, on the proof the recorded run of `northwind-14` left:

```
$ npm run verify:proof

Proof: …/near/proofs/northwind-14.json

What it says
  Party            alder.paridesk.testnet
  Deal             northwind-14, after action 30
  Fact             position
    accrual_start  2027-06-15
    carried        0.00
    principal      40,000,000.00

Checked, with no keys
  ✓ The fact and its salt hash to number 9 of the 12 hashes in the proof.
  ✓ At block 277320067 (2026-11-12 05:33 UTC) ledger.paridesk.testnet
    held the hash of that list as alder.paridesk.testnet's commitment.
  The other 11 hashes are salted. They show that the party's view holds 11 more facts, and nothing about them.
  This is still the party's latest view.

Control: the same proof with one digit of the fact changed
  ✓ Rejected: the fact, its salt and the list of hashes do not belong together.
  ✓ With its hash put into the list as well, so that the arithmetic agrees:
    rejected: at block 277320067 the chain did not hold this commitment for alder.paridesk.testnet.

PASS: the fact is what the enclave put in this party's view, and the proof shows no other.
```

**What a proof shows besides its fact.** The party's account, the deal, the number of the action the view is from, and how many facts the party's view holds. The other facts are in the proof as salted hashes only. The salts are new with every action and come from a seed only the party can read, so a hash cannot be matched against a guess ("is Alder's cash 485,833.33?") or against an older proof. The proof Alder cuts of what it holds contains no payment, no cash balance, no price and no other party's name; `npm run e2e` checks exactly that.

**What a proof is not.** It is not a signature and it is not zero-knowledge: the fact is shown in the clear to whoever holds the proof, and they can pass it on. Its weight comes from the chain: the rules contract stored that commitment from the answer of the one enclave build it pins. It says what the party's view held at one block, not what is true today.

The enclave and the checker are written separately, in Rust and in TypeScript. One enclave test, `test_the_enclave_and_the_proof_checker_agree_on_a_known_view`, holds the enclave to the salt, the hash and the commitment the TypeScript checker computed for a known view. And on every load `/visibility` recomputes each party's commitment in TypeScript from its opened envelope and compares it with the chain's: the eighth claim under **Checked live**.

## Why this needs NEAR

- **A contract can call an enclave and get the answer back in the same transaction.** OutLayer runs WASM inside Intel TDX with encrypted storage that persists between runs, and a NEAR contract calls it and resumes with the result (yield/resume). That is what lets the rules sit on chain while the books stay private. The contract, not a server, decides when the books run.
- **Keys that nobody holds.** The key that encrypts the books and the enclave's own X25519 key are derived by OutLayer's keystore for this project *and* the contract that called it. The program never sees the storage key, the developer has neither, and a run started by anyone but the rules contract gets a different key.
- **Named accounts for every role.** The agent is `agent.paridesk.testnet`, a lender is `alder.paridesk.testnet`. The contract's role checks and the enclave's views are keyed by names a person can read.
- **One token transfer that also runs the books.** The borrower pays with `ft_transfer_call` (NEP-141); the contract records the public amount and the enclave credits the books in the same transaction. If the books refuse, the tokens go back.

- **An agent that is two of three, with no change to the contract.** A NEAR account can be a [Sputnik DAO](https://github.com/near-daos/sputnik-dao-contract). Name the DAO as the deal's agent and every agent action becomes a proposal that two of three operators must approve. See [The agent as two of three](#the-agent-as-two-of-three).

Next on NEAR: withdrawals through NEAR's confidential intents, so that even those amounts are hidden.

## Trust model

**What you have to trust**

| | |
|---|---|
| Intel TDX, and OutLayer's attested workers and keystore | The books are private only if the enclave is, and the random bytes that blind the fingerprint and salt the commitments come from the worker. Each run has a TDX attestation you can fetch: `https://testnet-api.outlayer.ai/attestations/by-tx/<transaction hash>`. |
| The one enclave build the contract pins | The contract calls one build, named by its sha256, and no other. A deal names its build in the public arguments of the transaction that starts it, and `state` on the contract returns it as `version_key`. The live deal and both recorded runs pin `edef73c7a53ee924982553f96886efab8bc2cb1d000d51e74f9026118d0c705d`. Build it yourself with `near/build.sh` and compare (the build is not yet bit-for-bit reproducible across machines). |
| Whoever holds the contract account's key | In this demo the contract account still has its full-access key, which setup uses to deploy. Its holder could replace the contract, or start a new deal pinned to another enclave build. The same person owns the OutLayer project. In production that key is deleted or handed to a DAO. |
| The demo server | It holds a testnet key for every party, so one browser can play the whole deal. Each action is still signed by the one account entitled to it, and each screen opens only its own party's envelope. When the agent is a DAO, the server holds all three operators' keys as well. In production each party, and each operator, holds its own. The one exception is `/you`: there the visitor's browser holds the signing key and the view key, and the server plays only the other side. |
| Privy, if you sign in with it | Privy's embedded wallet keeps your account's key and signs when you approve. The browser-key option keeps the key in the browser's own storage instead. |

**What the public chain shows, on purpose or by inference**

- **Who is in the syndicate.** Envelopes are stored per account, and every action's reply lists one envelope slot per party.
- **Deposits and withdrawals, with amounts.** They are token transfers. A buyer's deposit and a lender's withdrawal are public; what the money is for, and what is left in the books, are not.
- **Who did what, and when.** Every action is a transaction signed by a named account. The chain shows that Alder offered a trade, that Delta accepted it and whether it settled. It does not show the size, the price or why a trade failed.
- **Totals.** One total per interest request, how much the borrower paid in and how much was credited to lenders as a single figure. A refusal for a wrong total states the right total.
- **Envelope sizes.** A party with more trades has a longer envelope. Envelopes are not padded to one length.
- **The agent's proposals, when the agent is a DAO.** Each proposal and each operator's vote is public, with the action's arguments: a rate, a total, the number of a request or a trade.

**What the contract's owner can and cannot do.** The owner (`paridesk.testnet`) loads the deal once, and can release the lock if a callback is lost. It cannot read the books, move money, act as the agent or set the fingerprint: only the enclave's answer to the contract's own request does that.

**What an outsider can do.** A buyer has to register a view key before it holds anything, so the contract lets any account register one, offer or accept a trade, pay test USDC in, or ask for a withdrawal. The contract vouches for who called, and the enclave decides whether the caller is entitled. An account outside the deal can't read the books or move anyone's money: its offers and acceptances are refused, a withdrawal pays out only test USDC it paid in itself, and its envelope holds the deal's public terms and nothing of anyone else's. It can slow the deal down. Each of its calls holds the one-at-a-time lock until the enclave answers, the contract pays OutLayer for that run, and a registered key adds one envelope slot to every later answer. A production deal would have the agent admit an account before it can call; that is not built.

**Not built.** Prepayments, inside-information documents and a hundred-lender scale test exist in [the Canton build](docs/canton.md) and were left out of this one.

## Tests

| What | Where | Run it |
|---|---|---|
| The deal's rules and the enclave's protocol: 28 tests. The deal's rules are ported from the Canton build's Daml tests with the same names and numbers | [`near/enclave/tests`](near/enclave/tests) | `cd near/enclave && cargo test` |
| Roles, the lock, the money caps, the public record: 26 tests | [`near/contract/src/tests.rs`](near/contract/src/tests.rs) | `cd near/contract && cargo test` |
| The whole deal on testnet, every figure and every envelope checked | [`near/scripts/src/e2e.ts`](near/scripts/src/e2e.ts) | `npm run e2e` |
| The leak test | [`near/scripts/src/prove-privacy.ts`](near/scripts/src/prove-privacy.ts) | `npm run prove:privacy` |
| A proof checked against the chain, and the same proof with one digit changed rejected | [`near/scripts/src/verify-proof.ts`](near/scripts/src/verify-proof.ts) | `npm run verify:proof` |
| Eight claims re-checked on every page load | `/visibility`, **Checked live** | open the page |

```
enclave   interest     5   one-step payment to the cent, pro rata, no favourites, all or none
          trading      5   cash against loan, interest split on the trade date, DQ screening, trade privacy
          principal    4   the Revlon guard: no request, settlement or withdrawal above what is due
          authority    3   only the right party runs each command
          protocol    11   one envelope per party, one-fact proofs, late answers, no guess confirmed, no box reused
contract              26   roles, one action at a time, credited ≤ paid in, payouts ≤ held, freeze
───────────────────────────────────────────────────────────────────────────────────────────────────
54 tests passing
```

Money is whole cents in integers everywhere. Interest is ACT/360, rounded down to the cent. A short payment pays each lender the same fraction of what it is owed, rounded down to the cent, and a cent lost to rounding goes back to the borrower, never to a lender. The expected figures (985,833.33, 591,500.00, 394,333.33, total 1,971,666.66, and 65,000.00 kept by the seller) are the same ones the Canton tests use.

## On testnet

| | |
|---|---|
| Rules contract | [`ledger.paridesk.testnet`](https://testnet.nearblocks.io/address/ledger.paridesk.testnet) |
| Test USDC (NEP-141, 6 decimals, no value) | [`usdc.paridesk.testnet`](https://testnet.nearblocks.io/address/usdc.paridesk.testnet) |
| Enclave program | OutLayer project `paridesk.testnet/pari-core` on [`outlayer.testnet`](https://testnet.nearblocks.io/address/outlayer.testnet) |
| The parties | `agent`, `northwind` (borrower), `alder`, `birch`, `cedar` (lenders), `delta`, `rival` (buyers), `auditor`, each `.paridesk.testnet` |

There are two recorded runs, both played by `npm run e2e` on the final builds, on 11 and 12 November 2026. `npm run prove:privacy` and `npm run verify:proof` read the newer one, `northwind-14`, played with one agent key. `npm run prove:privacy -- northwind-13` reads the other, played with the DAO as the agent; its transactions are under [The agent as two of three](#the-agent-as-two-of-three).

| Step of deal `northwind-14` | Transaction |
|---|---|
| The deal is loaded, every opening position sealed | [`DXbQjGs4…`](https://testnet.nearblocks.io/txns/DXbQjGs4qfPVSQZC89PHqJgFinAXHsNVYVPVZDHtEeP5) |
| The agent types 900,000,000.00: refused | [`o36Pf9jk…`](https://testnet.nearblocks.io/txns/o36Pf9jk2zAAGQ8sf8xLa4Edo7DHGAA2qgGT3Bb5P58) |
| The agent requests 1,971,666.66 | [`3AVZW7vF…`](https://testnet.nearblocks.io/txns/3AVZW7vFPf791Ro9vmaD1xdzv19wHQ2eEmjsJaXDg1ge) |
| The borrower pays, in one transfer | [`MZM57dBE…`](https://testnet.nearblocks.io/txns/MZM57dBEUMQ8NwzSzQ9HGCyahkDNXSzuAF6yyPARgU6) |
| One settlement pays three lenders | [`Dndv3Zvq…`](https://testnet.nearblocks.io/txns/Dndv3ZvqtTQh8JktXri4mieVPf8fyq59woE9aguFzQ4U) |
| Alder withdraws 500,000.00 of its payment | [`DBeuzbsp…`](https://testnet.nearblocks.io/txns/DBeuzbspmtNBBQJzvWd6sU7aShpeCEZmGbSXELkD6TsP) |
| The borrower sets its DQ list, sealed | [`FD3fH8P4…`](https://testnet.nearblocks.io/txns/FD3fH8P4kBwEFaR5rEhGHABo5f1suAvc1tQSHDir3pMz) |
| Alder's offer to Rival, sealed | [`AvRnAici…`](https://testnet.nearblocks.io/txns/AvRnAicioifGTyfBwgGFT66vn8uscVspSiLXPuXpBUnh) |
| Rival's trade is not settled | [`D85FiUHa…`](https://testnet.nearblocks.io/txns/D85FiUHaum7vGh1BCVzZ9TUqrPhC7mAw4U6SaF8ApCEi) |
| Delta's trade settles, cash against loan | [`CM8FBYGP…`](https://testnet.nearblocks.io/txns/CM8FBYGPz3yjzo7A29zY3LpR9gbVJtVjC5gKz8rdnYKo) |
| Birch sends Alder's sealed offer as its own: refused | [`C2rKHgyb…`](https://testnet.nearblocks.io/txns/C2rKHgybrk4Ep3oFfyvW7gW3wSe8ENbFR1UdhXvqwqyJ) |
| The borrower pays half of the second period's interest | [`FkfBEtXV…`](https://testnet.nearblocks.io/txns/FkfBEtXVGRk9vPEMX81nEmMuXkSvQayGbPNUGQ7MSsVh) |
| One settlement pays four lenders half each | [`DzXpdJXg…`](https://testnet.nearblocks.io/txns/DzXpdJXgG1smPvSh2v8yift82bdLLhgADJPXdNSazRpm) |
| The third period's settlement pays every unpaid half | [`3CG5ocEE…`](https://testnet.nearblocks.io/txns/3CG5ocEEnJTbp2c8FyNKA7YLHC5uefow85y9vQgSVzSz) |

All 36 transactions of that run are in [`near/runs/northwind-14.json`](near/runs/northwind-14.json). The full table, and the earlier deals, are in [docs/hackathon/PROGRESS.md](docs/hackathon/PROGRESS.md). `northwind-14` is the live deal as this is written. A new deal (`npm run setup -- --fresh`) replaces it on the contract; a run's transactions stay on the chain, so the leak test and the proof check go on passing on both runs. The proof `northwind-13` left was checked that way, after the contract had moved on to `northwind-14`.

## Layout

```
near/
├── contract/     the rules contract (Rust, near-sdk)
├── enclave/      the books: pure Rust deal logic, plus a thin OutLayer entry point
├── usdc/         a test USDC token (NEP-141) anyone can mint
├── scripts/      setup, the end-to-end run and the leak test (TypeScript)
├── runs/         the transaction hashes of the recorded runs
├── proofs/       the proof each recorded run left: one fact from Alder's view
└── build.sh      builds all three programs
web/
├── lib/near/         reads the contract, opens envelopes, signs actions
└── components/near/  the agent, borrower, lender, auditor and visibility screens, and the visitor's own account
```

The web app serves both builds. `PARI_BACKEND=near` switches every screen to NEAR; without it the app is the Canton build, unchanged.

## NEAR HACKATHON

- **Tracks:** privacy (primary), realworld.
- **Built during the hackathon:** everything under [`near/`](near), plus [`web/lib/near`](web/lib/near), [`web/components/near`](web/components/near) and the [`/you`](web/app/(app)/you) page: the contract, the enclave program, the test token, the scripts and the app's NEAR data layer and screens. The full diff from the earlier build is [`pre-hackathon...main`](https://github.com/martinvibes/pari/compare/pre-hackathon...main).
- **Existed before:** Pari was first designed for Canton at HackCanton Season 3. That build is tagged [`pre-hackathon`](https://github.com/martinvibes/pari/tree/pre-hackathon) (commit `392e45c`, the build as of 7 October 2026) and described in [docs/canton.md](docs/canton.md). The NEAR version reuses its idea, its demo deal, its test names and numbers, and the web app's visual layer. The `daml/` folder is untouched.
- **Libraries:** near-sdk and near-contract-standards 5.30, cargo-near 0.23, the OutLayer SDK 0.2, crypto_box 0.9 (libsodium-compatible sealed boxes), sha2, hmac, serde, base64 and getrandom in Rust; near-api-js 7.5, libsodium-wrappers 0.8, @privy-io/react-auth 3.51, Next.js 14 and React 18 in TypeScript.
- **AI tools:** the code was written with Claude Code (Anthropic) as a coding agent, directed and reviewed by the builder.
- **The builder's other entry:** [Selkie](https://github.com/SelkieLabs/Selkie).
- **Credit:** the web app's visual layer is derived from [sidereal-hedera](https://github.com/guha-rahul/sidereal-hedera) (Apache-2.0). See [NOTICE](NOTICE).

## License

Apache-2.0. See [LICENSE](LICENSE).
