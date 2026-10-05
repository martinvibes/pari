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
```

`make devnet-login` reads the password from the terminal and keeps only the
Keycloak tokens, in a git-ignored file. The app and the scripts refresh the
access token on their own (it lives three hours); sign in again only if the
refresh token is revoked.

`make devnet-seed` finds the eight parties among the ones your ledger user can
act as, by name, and runs `Pari.Demo:seed` over the gRPC Ledger API. It runs
once per set of parties: the node allows twenty parties per team, so a second
deal needs eight new ones, and the previous cast file moved away.

`make devnet-smoke` advances the seeded deal through every step the app
offers, so run it on a deal you no longer need for a walkthrough.

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
