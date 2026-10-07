# Pari web

The Pari website, docs and app. Next.js 14, React 18, Tailwind 3 and three.js.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run lint
npm run typecheck
```

The app screens read a running Canton ledger. From the repo root, run
`make sandbox` and then `make seed` first (see the main README).

| Path | Contents |
|---|---|
| `app/(marketing)/` | Landing page |
| `app/docs/` | Documentation |
| `app/(app)/` | The app: `/agent`, `/borrower`, `/lender/[id]`, `/visibility`, and the server actions |
| `components/` | Design-system and landing components |
| `components/app/` | App building blocks: panels, tables, action forms |
| `lib/ledger/` | JSON Ledger API v2 client and the demo cast |
| `lib/pari/` | Pari contracts as the app reads and writes them |
| `lib/world/` | The 3D scene behind the landing page (see `lib/world/WORLD.md`) |
| `scripts/smoke.ts` | End-to-end check against a live ledger (`npm run smoke`, or `make smoke` from the root) |

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PARI_LEDGER_URL` | `http://localhost:7575` | JSON Ledger API base URL |
| `PARI_LEDGER_USER` | `pari-web` | Ledger API user id for submissions |
| `PARI_LEDGER_TOKEN` | none | Bearer token, for authenticated ledgers |
| `PARI_CAST_FILE` | `.pari/cast.json` | Party ids written by `make seed` |
| `PARI_CAST` | none | The same party ids as inline JSON, instead of the file |

## Attribution

The visual layer (design system, landing-page components, 3D scene and docs
chrome) is derived from the
[sidereal-hedera](https://github.com/guha-rahul/sidereal-hedera) web app by
Rahul Guha and Poulav Bhowmick, under Apache-2.0, and modified for Pari. See
[NOTICE](../NOTICE).
