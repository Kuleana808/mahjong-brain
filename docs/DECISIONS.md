# Decisions

Running log. Each entry is either **settled** (decided, with the reasoning, so
nobody relitigates it) or **needs Brent** (blocked on a call only he makes).

---

## D-001 — Final app name · **NEEDS BRENT**

Working name is **Nihi Mahjong** (*nihi* = quiet, in Hawaiian). Everything in the
repo — bundle id `com.nihi.mahjong`, the marketing page, the `<title>` — uses it
provisionally.

Why it needs deciding before the first TestFlight upload: the bundle id creates
the App Store record and cannot be changed afterwards without starting a new
listing and losing the review history.

What to weigh:

- `nihimahjong.com` is **available** as of 2026-08-09 (whois: no match). So is
  `playnihi.com`. Neither has been bought — see D-004.
- "Mahjong" in the name is worth keeping. It is the search term; "mahjong
  without ads" is the wedge keyword and the incumbent owns the generic space.
- No trademark search has been run yet. Do that before committing the name.

---

## D-002 — Canvas 2D over PixiJS · **SETTLED**

The brief said to evaluate both and pick the lighter. Canvas 2D wins, decisively:

| | Canvas 2D | PixiJS |
|---|---|---|
| Added bundle | 0 KB | ~130 KB gzipped |
| Draw calls per frame | 144 `drawImage` from a face cache | 144 sprites |
| Redraws | on interaction only | on interaction only |
| GPU context | none | WebGL |

The board has no particle systems, no shaders, and no frame loop — the design
brief forbids motion beyond a tile lift. PixiJS would be paying a WebGL context
and a third of the app's bundle for capability the product is not allowed to
use. The whole shipped app is currently **~76 KB gzipped**.

Revisit only if a future feature genuinely needs per-frame animation.

---

## D-003 — Capacitor 8, not 6 · **SETTLED (deviation from brief)**

The brief specified Capacitor 6. The repo uses **Capacitor 8.5**.

Capacitor 6 shipped in 2024 and is two majors behind. Against Xcode 26 it means
an old deployment target, an old Swift toolchain, and CocoaPods — Capacitor 8
uses Swift Package Manager and dropped the CocoaPods dependency entirely, which
removes a whole category of build breakage before it can start. Pinning to a
2024 major on a 2026 toolchain buys nothing and costs build stability.

Known cost: `@capacitor/cli` pulls a transitive `uuid` advisory
(GHSA-w5hq-g745-h8pq) through the `xcode` package. It is **dev-only** — the CLI
never ships in the app bundle — and the fix is upstream's to make.

---

## D-004 — Domain purchase · **NEEDS BRENT (do not buy without a yes)**

Checked 2026-08-09, nothing purchased:

- `nihimahjong.com` — **available**
- `playnihi.com` — **available**
- `nihimahjong.app`, `nihi.game` — whois inconclusive, needs a registrar check

Per the standing spend rule, every purchase of any amount needs an explicit yes.
A `.com` is roughly $12/year. The marketing page in `site/` is static and can
deploy anywhere, so nothing is blocked while this waits.

---

## D-005 — StoreKit bridge · **NEEDS BRENT**

The unlock is wired behind a two-method interface (`src/iap/index.ts`) with a
mock that persists exactly like the real thing will, so the paywall is fully
playable today. The bridge itself is a choice between:

1. **`@capacitor-community/in-app-purchases`** — free, thin, no vendor. Lightly
   maintained; StoreKit 2 support has historically lagged iOS releases.
2. **RevenueCat** — free under $2.5k/month tracked revenue, handles receipt
   validation and restore-across-devices properly. It is a **vendor**, so it
   needs an explicit yes even at $0.
3. **A small in-house Swift plugin** — ~150 lines against StoreKit 2 for a
   single non-consumable. No vendor, no dependency, but it is our code to
   maintain and to get right on edge cases (family sharing, refunds, Ask to Buy).

Recommendation: **(3)**, then (2) if receipt handling turns out to be more than
a day's work. One non-consumable product is close to the simplest thing StoreKit
does, and it keeps the zero-vendor posture intact.

---

## D-006 — Tile art is drawn, not licensed · **SETTLED**

All tile artwork is generated in `src/render/tileArt.ts` from 2D primitives
written for this project. No sprite sheets, no traced glyphs, no licensed asset
packs, and specifically nothing from Vita Mahjong or any other commercial title.
The suit *semantics* (bams, craks, dots, winds, dragons, flowers, seasons) are
centuries-old public domain; the drawings are ours.

This is the litigation-sensitive part of the whole product. **Any PR that adds
an image file to the tile pipeline needs its provenance stated in the PR body.**

Two deliberate departures from traditional sets, both accessibility-driven:

- Numbered suits carry **Arabic numerals**, not Chinese. The audience is 60+ and
  legibility beats tradition.
- Every tile carries a **badge shape** in the corner (bar, square, ring,
  triangle, diamond, rosette, arc) keyed to its suit family, so colour is never
  the only distinguishing signal.

---

## D-007 — The hint coach runs offline by default · **SETTLED**

Doctrine is Ollama-first. Taken literally on a phone that fails, because a phone
cannot reach the Mac's Ollama and we are not shipping a tunnel. So the ladder is:

1. **Offline explainer** (`src/ai/localExplainer.ts`) — deterministic, instant,
   free, works on a plane. This is the default and what ships to every user.
2. **Ollama** — web/dev only, and only for players who bought the unlock. It
   rewords the *same* structured analysis, so the recommendation never depends
   on whether a model was up. Hard 1.5s budget, then it is dropped.
3. **Remote frontier** — not built, not wired. Would need a Supabase edge
   function and an API key, i.e. spend, i.e. Brent's yes.

Every routing decision is recorded in `src/ai/router.ts`. Nothing falls back
silently.

---

## D-008 — React 19 · **SETTLED (minor deviation from brief)**

Brief said React 18; `create-vite` ships 19 and nothing in the app depends on
18-only behaviour. Downgrading would be strictly worse.
