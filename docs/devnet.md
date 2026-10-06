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
   `registry`, `agent`, `northwind`, `alder`, `birch`, `cedar`, `delta` and
   `rival`. The Console prefixes each with your namespace and gives your ledger
   user act-as rights on it.
2. Under **Collections**, upload `daml/pari-demo/.daml/dist/pari-demo-0.1.0.dar`
   (from `make build`). It carries Pari, the seed script and the CIP-56 test
   token the demo settles in.

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

`make devnet-seed` finds the eight parties among the ones your ledger user can
act as, by name, and runs `Pari.Demo:seed` over the gRPC Ledger API.

`make devnet-smoke` advances the seeded deal through every step the app
offers, so run it on a deal you no longer need for a walkthrough.
`make devnet-reset` lists every active contract of the eight parties and, once
you confirm, archives them all in one transaction, so `make devnet-seed` can
start a fresh deal on the same parties. It can, only because in this demo one
ledger user acts as every party.

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

- Money is the CIP-56 test token from the DAR, issued by the `registry`
  party, not Canton Coin. Pari settles any CIP-56 token; Canton Coin
  settlement is planned.
- The node runs on wall-clock time. The demo's interest periods are fixed
  dates, and nothing in the model compares them with the clock, so the deal
  behaves the same as on the sandbox.
- Every party is still hosted on one participant and driven by one ledger
  user, as in the sandbox demo. In production each party signs from its own
  node.

When the node rejects a request it returns a trace id (TID). Look it up in
the node's Grafana, or send it to NODERS, as their quickstart describes.

## Run on 6 October 2026

`make devnet-smoke` passed all 11 checks on the HackCanton node, on the
Canton DevNet global synchronizer
(`global-domain::1220be58c29e65de40bf273be1dc2b266d43a9a002ea5b18955aeef7aac881bb471a`).
Four of its transactions, as the agent sees them:

| Step | Update id | Token transfers |
|---|---|---|
| Closing: every lender funds the borrower | `12202c0ccd0b235208e35b192c7684ff13d7ca1f6cd5ef9dae30e57492daf55368f9` | 3 |
| Alder sells 10m to Delta, delivery versus payment | `122031a9d0a29721d78d94b109f25ac2232563b44ba8f966a344e3a04d552f49d878` | 1 |
| Interest paid short at 50%, to every lender | `12204fb0e2515af04ec544291fc9f009c1f59b33f77093738e4473401224631cc26a` | 4 |
| Northwind prepays 25m, pro rata | `122036007c1d3ac8dae39c12bdb73788b4b245169bf96467065715cf61500db68223` | 4 |

The trade's one transfer is Delta's cash to Alder; the position moves in the
same transaction. Update ids are visible only to the parties in each
transaction, so these can be looked up on the node by those parties alone.
