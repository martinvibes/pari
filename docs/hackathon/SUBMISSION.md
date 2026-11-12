# Pari on NEAR: submission drafts

Drafts only. Nothing here has been submitted or posted. The builder submits the
form and publishes the X post.

Rules re-read on 2026-11-11 from https://nearhackathon.com/HACKATHON.md.
Deadline: **2026-11-14T23:59:00Z** (Saturday 23:59 UTC, Sunday 00:59 in Lagos).

## The form

`POST https://nearhackathon.com/api/applications`, exactly these fields.

| Field | Value |
| --- | --- |
| `projectName` | Pari |
| `leadName` | *(the builder's name, 2 to 80 characters)* |
| `email` | *(the builder's email; at most 2 submissions per email)* |
| `size` | `1` |
| `tracks` | `["privacy", "realworld"]` |
| `nearAddress` | *(the builder's **mainnet** NEAR account, for the payout)* |
| `projectUrl` | `https://github.com/martinvibes/pari` |
| `demoUrl` | *(the URL of the X post, once published)* |
| `idea` | the text under "What did you build?" below (1,989 characters; the limit is 2,000) |
| `consent` | `true`, after the builder has read the contact notice |

Leave `website` empty: it is a spam trap. One submission per repository; a
second POST for the same repository is rejected, and corrections go through the
request-changes page.

### One-liner

A syndicated loan's books on NEAR: the rules in a contract, the books in a TDX
enclave, and each party sees only its own.

### What did you build?

```
Pari is the administrative agent's books for a syndicated loan, on NEAR.

In 2020 Citibank, as Revlon's loan agent, meant to pay $7.8M of interest and wired $900M instead. Loans still run on email and spreadsheets. They can't simply move to a public chain either, because the chain would publish every lender's position, every trade price and the borrower's list of banned buyers.

Pari splits the job in two. A NEAR contract holds the rules: who may do what, one action at a time, and a cap on every payout. The books themselves (positions, cash, trade prices, the banned-buyer list) live in encrypted storage inside an Intel TDX enclave on OutLayer, which the contract calls and resumes from. After every action the enclave returns a fingerprint of the books and one sealed envelope per party. The public chain sees one total and a fingerprint. Each lender opens only its own envelope.

Working on testnet today:
- interest paid to three lenders in one step, to the cent;
- a mistyped $900,000,000 total refused by the enclave, with a second, independent cap in the contract;
- a loan trade settled cash against loan at a sealed price;
- a banned buyer refused without learning why;
- a short payment shared pro rata, the rest paid with the next period;
- the agent as a two-of-three Sputnik DAO: one approval moves nothing;
- an auditor who sees every payment and no price;
- a lender proving one fact from its sealed view to anyone, and nothing else.

Anyone can check the privacy claim with no keys: one command downloads every transaction of a recorded run and the contract's whole storage from NEAR, and finds none of the deal's secrets. There are 54 Rust tests; the deal's rules keep the names and numbers of the original test suite.

Pari was first built for Canton, where the ledger itself is private. The NEAR version is a new build made during the hackathon: a new contract, a new enclave program and a new data layer. The README discloses the earlier build and links the diff.
```

## The X post

The builder posts it. It must say the project was built at NEAR HACKATHON, tag
@NEARProtocol and #NEARHackathon, and carry the demo video. @NearLegion and
@NearBuilders are optional. The draft is 278 characters with the link counted
as X counts it (23), inside the 280 limit.

```
In 2020 Citi meant to pay $7.8M in interest. It wired $900M.

Pari keeps a loan's books on NEAR: rules in a contract, books in a TDX enclave. Each lender sees only its own. The $900M typo is refused.

Built at NEAR HACKATHON @NEARProtocol #NEARHackathon

github.com/martinvibes/pari
```

## The demo video (about two minutes)

Record against a fresh deal: `npm run setup -- --fresh` in `near/scripts`, then
`PARI_BACKEND=near npm run dev` in `web`. Each action usually takes 10 to 30
seconds on testnet, and over a minute when OutLayer's testnet is busy, so cut
the waits.

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 | A title card, or the Revlon headline | "In 2020 Citibank meant to pay 7.8 million dollars of loan interest. It wired 900 million." |
| 0:12 | The README diagram | "A loan can't live on a public chain. Every position, price and banned buyer would leak. On NEAR, Pari keeps the rules in a contract and the books in an enclave." |
| 0:30 | `/agent`: Fix rate, then type `900,000,000.00` and press Request interest | "The agent types 900 million. Refused: the register says 1,971,666.66." Then request the right total. |
| 0:50 | `/borrower`: Pay. `/agent`: Settle all 3 lenders | "The borrower pays once. One settlement pays three lenders." |
| 1:05 | `/visibility`, then `/lender/alder` | "The public chain shows one total and a fingerprint. Alder sees 985,833.33 and nothing about Birch or Cedar." |
| 1:25 | Rival's refused trade, Delta's settled one, `/borrower` | "Rival is on the borrower's banned list. Its trade doesn't settle, and it is never told why. Delta buys ten million at a sealed price. The borrower sees the trade, not the price." |
| 1:45 | A terminal: `npm run prove:privacy` | "Every transaction and the contract's whole storage, searched for the deal's secrets. Zero found." |
| 1:55 | The repository | "Built at NEAR HACKATHON." |

Two optional segments, about 15 seconds each, placed before the leak test.

| On screen | Say |
| --- | --- |
| `/lender/alder`: press **Prove** beside the settled payment. `/verify` reads **It holds**. Change one digit in the box and check again: **It does not hold** | "Alder can hand an outsider one payment from its sealed view. Anyone checks it against NEAR with no key, and nothing else is shown." |
| `/agent`: press **Settle all 3 lenders**; the receipt says nothing has moved. Then **Approve as operator 2** in the **Two of three** panel | "The agent can be two of three operators. One approval moves nothing. The second one pays every lender." |

The second one needs its own recording, on a deal made with
`npm run setup -- --fresh --dao`.

The recorded runs in the README were played by `npm run e2e`. A fresh deal for
the video replaces the live deal on the contract, which is fine: the leak test
still reads the recorded run's transactions, and says the contract has moved on.

## What judges clone

The form takes the repository's URL, and a plain `git clone` gives the default
branch, `main`. The NEAR build is on `main`: one commit holds the Canton build
as it stood on 7 October 2026 (tag `pre-hackathon`), and every commit after it
was made during the hackathon.

Tag the final commit `hackathon-submission`; the rules accept the
`pre-hackathon` and `hackathon-submission` tags plus the README's diff link.

## Checklist

- [x] `main` pushed with the `pre-hackathon` tag (12 November; the NEAR work is public)
- [ ] Final commit tagged `hackathon-submission`
- [ ] Repository public, with its LICENSE (Apache-2.0 is there), through 2026-11-18
- [ ] README section 1 run from a fresh clone: both `cargo test` runs, `npm run prove:privacy` and `npm run verify:proof`
- [ ] Demo video recorded; its link added at the top of the README
- [ ] Hosted demo (optional, "a plus"): `docker build -f near/Dockerfile`, with the variables from `npm run demo:env`; link added to the README; kept up through 2026-11-18
- [ ] X post published with the video, saying "Built at NEAR HACKATHON", tagging @NEARProtocol and #NEARHackathon
- [ ] Selkie's README names Pari (Pari's README already names Selkie)
- [ ] Mainnet payout account ready for `nearAddress`
- [ ] Form submitted before 2026-11-14T23:59:00Z, after Selkie's
