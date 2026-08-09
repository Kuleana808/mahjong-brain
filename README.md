# Nihi Mahjong

Solitaire mahjong that stays quiet. No ads, no timers, no streaks, no daily
check-ins, no energy meter, no "come back tomorrow". One board, one tap to
start, and a hint coach that teaches you to see the pattern instead of just
pointing at a pair.

*Nihi* is Hawaiian for quiet. The name is provisional — see
[docs/DECISIONS.md](docs/DECISIONS.md), D-001.

---

## Why this exists

The category leader is #1 in Board, #7 overall, 4.9★ across 1.6M ratings — and
its loudest one-star cluster is people saying the ads break the calm. There is
no AI anywhere in it. "Mahjong without ads" is a phrase people actually type
into the App Store.

So: the same proven mechanic, rebuilt with the interruptions removed and an
actual coach in the box. **Mechanic only.** None of the incumbent's art, layout
art, name, logo, or UI chrome is reproduced here, and none of it ever will be —
see D-006. Clone litigation is live in this niche.

## Business model

Free download. **$4.99 once**, for the ad-free experience and the AI hint coach.

That is the entire model. No IAP tiers, no consumables, no subscription, no
rewarded video, and no ads even in the free tier. The paywall appears exactly
once, after the third *completed* board — never before one, never mid-board,
never on a timer.

## Stack

| | |
|---|---|
| Shell | Capacitor 8 → iOS, Android, Web (one codebase) |
| App | React 19 · TypeScript · Vite |
| Rendering | Canvas 2D + an offscreen face cache ([why not PixiJS](docs/DECISIONS.md#d-002--canvas-2d-over-pixijs--settled)) |
| State | Zustand |
| Storage | `@capacitor/preferences`, on-device only |
| AI coach | Offline explainer by default; Ollama for phrasing on web/dev |
| Purchases | StoreKit 2 behind a two-method interface (bridge TBD, D-005) |
| Analytics | None. No vendors, no SDKs, no third-party pixels. |

Shipped bundle: **~76 KB gzipped**.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5183
npm test           # game core, difficulty model, hint coach
npm run build      # typecheck + production build
```

iOS:

```bash
npm run ios:sync   # build, then copy into the Xcode project
npm run ios:open   # open ios/App/App.xcworkspace
```

The iOS project uses Swift Package Manager — no CocoaPods, no `pod install`.

### Optional: Ollama phrasing in dev

The hint coach works fully offline and that is what ships. On web/dev, if Ollama
is running it will reword hints:

```bash
ollama serve
ollama pull gemma3:4b
```

Override with `VITE_OLLAMA_MODEL` / `VITE_OLLAMA_HOST`, or turn it off with
`VITE_DISABLE_OLLAMA=true`. Content never depends on it — only phrasing does.

## Layout of the code

```
src/
  game/       pure rules — tiles, layouts, freeness, dealing, difficulty
  ai/         the hint coach: analysis → explanation, and the model router
  render/     palette, layout→screen geometry, tile artwork, canvas renderer
  state/      zustand store and on-device persistence
  iap/        the lifetime unlock, behind an interface
  ui/         React components
site/         the one-page marketing site
docs/         decisions and roadmap
```

`src/game/` has no imports from React, the DOM, or anything above it. It is
pure and it is where the tests live.

## Accessibility

The bar is WCAG 2.1 AA on the web build, and it is treated as a feature, not a
checklist:

- **The board is keyboard-playable.** A transparent button sits over every tile
  with a real accessible name ("5 of Bamboo, free on the left"). Only *free*
  tiles are in the tab order; arrow keys move between them by direction.
- **Colour is never the only signal.** Every tile carries a suit badge *shape*
  and, on numbered suits, an Arabic numeral. Hues come from a colourblind-safe
  set. A player who sees no colour at all can still play.
- **Text scales** — three sizes, and the setting multiplies every size in the
  app, board chrome included.
- **High-contrast theme** clears AAA.
- **Motion** is limited to a tile lift and a card fade, and both respect
  `prefers-reduced-motion` plus an in-app override.
- Pinch-zoom is left enabled (WCAG 1.4.4). Every target is ≥44×44 px.

## The kill signal

Pre-committed, on purpose, before anyone is attached to it:

> **Day 30 after TestFlight — if D30 retention < 25% or paid conversion < 3% of
> installs, the project is killed.**

Do not move the numbers after seeing the results.

## Contributing

`main` is protected. Work on `<topic>-claude` branches, push with
`--force-with-lease`, and open a PR. Roadmap is in
[docs/ROADMAP.md](docs/ROADMAP.md).

Any PR that adds an image asset to the tile pipeline must state where the asset
came from. See D-006.
