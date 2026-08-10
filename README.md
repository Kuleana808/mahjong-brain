# Mahjong Brain

Tile-matching solitaire with a four-slot holder, built as a **functional-parity
clone of the category leader with entirely original art** — then iterated on
live data.

Name locked 2026-08-09 (D-001). The **bundle id is not** — it becomes the App
Store record permanently, so it stays on a placeholder until it is chosen. See
[docs/DECISIONS.md](docs/DECISIONS.md).

---

## Why this exists

The category leader is #1 in Board, #7 overall, 4.9★ across 1.6M ratings — and
there is no AI anywhere in it.

**We ship its game, not our opinion of its game.** v0.1 is functional parity:
the same holder mechanic, the same onboarding beats, the same monetisation
hooks, the same retention loops. Differentiation is earned after parity with
cohort data, not asserted before it (see [D-014](docs/DECISIONS.md)).

What is ours from day one is the **art and the creative** — every tile drawn
here, our own brand, our own voice. That is the anti-litigation layer and the
only thing that makes this a product rather than a reskin. Nothing of the
incumbent's art, layout art, name, logo or UI chrome is reproduced, and it never
will be. See D-006.

The AI hint coach — the one thing that could make this ours — is deliberately
**not in v0.1**. It ships once instrumentation shows what teaching hints change.

## The loop

Tap a free tile and it goes into a **four-slot holder**. Two matching tiles in
the holder clear. Fill all four with no match and the run ends — which is the
moment Revive is offered, and the reason Shuffle and Hint exist.

## Money

Parity monetisation, live from tile one:

| | |
|---|---|
| **Revive** | rewarded ad, offered when the holder fills |
| **Hint** | rewarded ad |
| **Shuffle** | IAP, consumable |
| **Remove ads** | IAP, non-consumable — a post-launch A/B test, not the pitch |

No API grants any of it from a click. A revive needs a verified ad callback and
a purchase needs a verified StoreKit transaction.

## Measurement

Instrumentation ships before feature #1 and **nothing launches without it**.
Every onboarding screen, every tap, every holder fill, every ad and IAP funnel
step, D1/D7/D30 cohorts. First-party only — no third-party analytics SDK, a
rotating resettable device id, and no way to join an event to an identity. See
[D-016](docs/DECISIONS.md), which also flags what an ad SDK does to the privacy
label.

No feature ships without a hypothesis and a metric. v0.1 goes to 50-100 users,
v0.2 follows a week of data. There is no "1.0".

## Stack

| | |
|---|---|
| Shell | Capacitor 8 → iOS, Android, Web (one codebase) |
| App | React 19 · TypeScript · Vite |
| Rendering | Canvas 2D + an offscreen face cache ([why not PixiJS](docs/DECISIONS.md#d-002--canvas-2d-over-pixijs--settled)) |
| State | Zustand |
| Storage | `@capacitor/preferences`, on-device only |
| AI coach | Offline explainer by default; Ollama for phrasing on web/dev |
| Purchases | StoreKit 2, consumables + one non-consumable (bridge TBD, D-005) |
| Instrumentation | First-party, Supabase-native. No third-party analytics SDK. |
| Ads | Rewarded video for Revive and Hint. Network not chosen — needs a yes. |

Shipped bundle: **~76 KB gzipped**.

## Launch week

Compressed plan and honest status in **[docs/launch-week.md](docs/launch-week.md)** —
what is actually verified, what is blocked on whom, and the pre-submission gate.

## Getting started

```bash
npm install
npm run dev             # the game, :5183
npm run api             # contracts dev server, :5185
npm run marketing:dev   # marketing site, :5186
npm test                # 231 tests
npm run smoke:events    # instrumentation, end to end
npm run preflight       # pre-submission gate — run before any upload
npm run build           # typecheck + production build
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
packages/core/src/
  game/         pure rules — tiles, layouts, freeness, dealing, difficulty
  play/         the four-slot holder session — the parity mechanic (D-015)
  flow/         the nine-screen state machine (docs/screen-flow.md)
  progression/  level and IQ
  ai/         the hint coach: analysis → explanation, and the model router
  telemetry/  the closed event catalogue
  contracts/  the twelve API contracts, shapes and handlers
apps/api/       dev server + adapters (Apple, StoreKit, sessions, stores)
apps/marketing/ Next.js static export → Cloudflare Pages (copy scaffold)
supabase/     append-only migrations, RLS on, cohort views
src/          rendering and UI — Codex's, moving to apps/mobile/
site/         the one-page marketing site
docs/         decisions, roadmap, and the API contracts
```

`packages/core/` imports nothing from React, the DOM, Capacitor or the
filesystem. It is pure and it is where most of the tests live.

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
- The accessibility bar is **not** retired by the parity doctrine — it is part
  of the creative half, which stays ours.
- Pinch-zoom is left enabled (WCAG 1.4.4). Every target is ≥44×44 px.

## The iteration trigger

Pre-committed, on purpose, before anyone is attached to the numbers:

> **Day 30 after TestFlight — if D30 retention < 25% or paid conversion < 3% of
> installs, pause.** Report the miss and the underlying cause, put the iteration
> options on the table, and Brent decides: iterate, pivot, park, or stop.

The threshold exists to force honest measurement, not to make the decision.
Nothing shuts itself down: no branch gets deleted, no infrastructure gets torn
down, and no "we're closing" message reaches a real user without Brent saying so
first.

Do not move the numbers after seeing the results — moving them is how you avoid
the conversation the trigger is meant to start.

## Who owns what

Two agents build this, and contracts are the seam between them.

| | Owns |
|---|---|
| **Claude Code** | `packages/core/**` game engine, `apps/api/**`, `supabase/**`, auth, settings sync, instrumentation, AI routing, receipt validation, `site/` |
| **Codex** | `apps/mobile/**`, `ios/**`, tile rendering, the visual language, accessibility, onboarding screens, ad and StoreKit UI, TestFlight |

Neither side pushes across the line without an explicit contract change. The
contracts live in [docs/api-contracts.md](docs/api-contracts.md) — that document
is the interface, and changing a shape there is a PR both sides review.

## Contributing

`main` is protected. Claude Code works on `<topic>-claude` branches, Codex on
`codex/*`. Push with `--force-with-lease`, PR only, green CI before merge. Run
`git status` before writing to a shared file, and if the other side touched it
in the last 24 hours, defer.

Roadmap is in [docs/ROADMAP.md](docs/ROADMAP.md).

Any PR that adds an image asset to the tile pipeline must state where the asset
came from. See D-006.
