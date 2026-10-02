# Pari web

The Pari website, docs and app. Next.js 14, React 18, Tailwind 3 and three.js.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run lint
npm run typecheck
```

| Path | Contents |
|---|---|
| `app/(marketing)/` | Landing page |
| `app/docs/` | Documentation |
| `components/` | Design-system and landing components |
| `lib/world/` | The 3D scene behind the landing page (see `lib/world/WORLD.md`) |

## Attribution

The visual layer (design system, landing-page components, 3D scene and docs
chrome) is derived from the
[sidereal-hedera](https://github.com/guha-rahul/sidereal-hedera) web app by
Rahul Guha and Poulav Bhowmick, under Apache-2.0, and modified for Pari. See
[NOTICE](../NOTICE).
