# Pari on the HackCanton DevNet

The HackCanton node is a participant on the Canton DevNet hosted by NODERS.
Each team gets a namespace on it and creates its own parties and DARs in the
node's Console, and reaches the Ledger API with a Keycloak token for its
hackathon account. The NODERS quickstart covers the node itself; this page
covers what Pari needs.

## 1. Parties and the DAR, in the Console

Sign in at <https://console.participant.hackcanton-01.devnet.naas.noders.services/>
with **Sign in with Authfactory**, open **Participants**, then the HackCanton
node.

1. On the **Parties** tab, create one party for each member of the demo cast:
   `registry`, `agent`, `northwind`, `alder`, `birch`, `cedar`, `delta`,
   `rival` and `auditor`. The Console prefixes each with your namespace and
   gives your ledger user act-as rights on it.
2. Under **Collections**, upload `daml/pari/.daml/dist/pari-0.2.0.dar` (from
   `make build`), the Pari model. Canton Coin's packages are on every DevNet
   node already, and the seed script and the tests run from your machine, so
   their packages need not be on the node.

## 2. Sign in, seed and run

```bash
make devnet-login   # your hackathon email and password; tokens to web/.pari/
make devnet-seed    # the demo deal on those parties; cast to web/.pari/devnet-cast.json
make devnet-web     # the app against DevNet, at http://localhost:3000
make devnet-smoke   # optional: drive the seeded deal through every app action
make devnet-reset   # archive the deal, to seed the same parties again
```

`make devnet-login` reads the password from the terminal and keeps only the
Keycloak tokens, in a git-ignored file. The app and the scripts refresh the
access token on their own (it lives three hours); sign in again only if the
refresh token is revoked.

`make devnet-seed` finds the nine parties among the ones your ledger user can
act as, by name, and seeds the demo deal in Canton Coin over the JSON Ledger
API (`web/scripts/seed-coin.ts`):

1. It taps the DevNet faucet (`AmuletRules_DevNet_Tap`, as the receiver) for
   each party's cash, with a few coins over for holding fees, and skips a
   party that already holds enough from an earlier seed.
2. Each lender funds its commitment through Canton Coin's own CIP-56
   allocation factory, which the validator's scan proxy serves with its
   choice context (`/registry/allocation-instruction/v1/allocation-factory`).
3. The agent closes the facility with every allocation's execute-transfer
   context from the same registry, so all three lenders fund Northwind in one
   transaction, as on the sandbox.

The app settles every later payment, trade and prepayment the same way, and
releases cash with the registry's withdraw context.

`make devnet-smoke` advances the seeded deal through every step the app
offers, so run it on a deal you no longer need for a walkthrough.
`make devnet-reset` lists every active Pari and test-token contract of the
nine parties and, once you confirm, archives them all in one transaction, so
`make devnet-seed` can start a fresh deal on the same parties. It can, only
because in this demo one ledger user acts as every party. Canton Coin stays:
its holdings are the DSO's to archive, and the next seed spends them first.

## Pinned packages

The node is shared, and any team can upload a package with the same name as
one Pari uses and a higher version. Unless a submission says otherwise, the
participant runs the highest vetted version of each package name, for
creates and for interface choices alike. That happened here: someone else's
`splice-test-token-v1` 1.0.1 sat next to the 1.0.0 in Pari's DAR, and the
first seed ran its token code.

So every submission names the package ids it runs: the seed through
`packagePreference`, the app through `packageIdSelectionPreference`. The ids
are those of Pari and the token-standard packages in the DAR, and
`scripts/devnet.sh` stops if the node lacks any of them.

## What differs from the sandbox

- Money is Canton Coin, from the DevNet faucet, where the sandbox uses a
  CIP-56 test token issued by the `registry` party. Pari's model is the same
  for both; only the registry the app asks for choice contexts differs
  (`web/lib/ledger/registry.ts`).
- Canton Coin charges holding fees to the payer when it spends, so a payer's
  change comes back a fraction of a coin short. Every amount a lender, seller
  or borrower receives is exact. The smoke test checks payers' cash to within
  one coin of the model's figure, and receivers' to the cent through the
  auditor's replay.
- The node runs on wall-clock time. The demo's interest periods are fixed
  dates, and nothing in the model compares them with the clock, so the deal
  behaves the same as on the sandbox.
- Every party is still hosted on one participant and driven by one ledger
  user, as in the sandbox demo. In production each party signs from its own
  node.

When the node rejects a request it returns a trace id (TID). Look it up in
the node's Grafana, or send it to NODERS, as their quickstart describes.

## Run on 6 October 2026, in Canton Coin

`make devnet-seed` and `make devnet-smoke` passed all 13 checks on the
HackCanton node, settling in Canton Coin on the Canton DevNet global
synchronizer
(`global-domain::1220be58c29e65de40bf273be1dc2b266d43a9a002ea5b18955aeef7aac881bb471a`).
Five of its transactions, as the agent sees them:

| Step | Update id | Canton Coin transfers |
|---|---|---|
| Closing: every lender funds the borrower | `12208b2861723bafb8434dff7a69629dcb59aef8202580aa9a33f6b744a6bdf14e71` | 3 |
| Alder sells 10m to Delta, delivery versus payment | `122073bf14f5ef5f0f638cc232a05e5692ac21c564d4e25fe68bd456f84ea792d902` | 1 |
| Interest paid short at 50%, to every lender | `122022c1e02108052e32727d90497d7cd8095b03d6bdfdf602ae1731532f54666879` | 4 |
| Northwind prepays 25m, pro rata | `1220a92e0e89dbb3651fc61488354b2c26bfa970c5c6b866b32cca967f932be1c451` | 4 |
| Next period's interest, the unpaid half rolled in, paid in full | `122036c09e62744133141807ce9f671727a882a2543c7e860c365610df446b8a0628` | 4 |

Each transfer is Canton Coin's own `AmuletAllocation` executed inside Pari's
choice: the closing transaction exercises `Facility_Close`, then for each
lender `Commitment_Fund`, `Allocation_ExecuteTransfer` on
`Splice.AmuletAllocation` and `LockedAmulet_UnlockV2`, and creates the three
positions and the borrower's new `Amulet` holdings with it. The trade's one
transfer is Delta's coin to Alder; the position moves in the same
transaction. Update ids are visible only to the parties in each transaction,
so these can be looked up on the node by those parties alone.

An earlier run the same day, in the CIP-56 test token, passed the 11 checks
the smoke test had then.
