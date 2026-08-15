# Roadmap to TestFlight

Two agents build this. Contracts are the seam — see
[api-contracts.md](api-contracts.md) and D-010.

| | Owns |
|---|---|
| **Claude Code** | `packages/core/**`, `apps/api/**`, auth, settings sync, AI routing, receipt validation, `site/`, `docs/` |
| **Codex** | `apps/mobile/**`, `ios/**`, tile rendering, visual language, accessibility, StoreKit UI, TestFlight |

**Compressed to this week (Brent 2026-08-10) — see
[launch-week.md](launch-week.md) for day-1 status and blockers.**

Original target was TestFlight in 2–4 weeks. TODOs are marked at the call sites too, so
the work is findable from where it happens.

---

## Done

- **Scaffold** — playable board end to end, 327 tests, iOS builds clean on
  Xcode 26.
- **`packages/core`** — game engine and AI hint routing extracted, runtime-
  agnostic, importable as `@mahjong-brain/core`.
- **The ten contracts** — shapes, handlers, 5-state envelope, dev server.
- **The adapters** — Apple identity verification, HMAC sessions, StoreKit 2 JWS
  with full `x5c` chain validation and Apple Root CA G3 pinning, a Supabase
  store over PostgREST, and an in-process dev store. The dedicated production
  project is live; a real sandbox transaction remains a release gate and all
  unconfigured paths fail closed.
- **The schema** — `supabase/migrations/`, append-only, RLS on, cohort views.
- **The holder mechanic** (D-015) — `@mahjong-brain/core/play`, the parity loop.
- **Instrumentation** (contract 11) — closed event catalogue covering every
  onboarding screen, tap, holder fill, ad and IAP funnel step, plus D1/D7/D30
  cohort views.
- **Daily reward and streaks** (contract 12).
- **The nine-screen flow machine** — `@mahjong-brain/core/flow`, with the gates,
  resume behaviour and instrumentation attached. See [screen-flow.md](screen-flow.md).
- **Level and IQ** — `@mahjong-brain/core/progression`. Tuning provisional.
- **Marketing site shell** — `apps/marketing/`, Next.js static export for
  Cloudflare Pages. Copy scaffold; Codex owns polish.
- **Instrumentation smoke test** — `npm run smoke:events`, real machines through
  the real handler. The production run stored 184 events / 38 names in the
  dedicated Mahjong Brain project.
- **Pre-submission gate** — `npm run preflight`. It reads the ignored release
  client config, verifies a live solvable board, and proves the deployed
  StoreKit verifier fails closed.
- **Original interaction sound system** — Web Audio synthesis for tile, match,
  blocked, holder warning/full, hint, shuffle, undo, and win cues; independently
  controlled from Settings with no borrowed audio samples.

---

## Claude Code — next

### C1 — Supabase production project — complete

The dedicated `Mahjong Brain` project (`dxtzbidjtkeekthompqb`) is active in
`us-west-1`. Migrations 0001–0004 and the `contracts` Edge Function are live.

- Project created and migrations 0001–0004 applied.
- `SUPABASE_URL`, the service-role key, session key, Apple audience, and pinned
  root are stored in Supabase secrets.
- `handle()` is deployed as the `contracts` Edge Function. The public release
  URL is configured in the mobile production build.

Bundle ID `com.nihi.mahjong` is locked. Production board generation, settings,
unlock status, retention, and anonymous event storage are verified against this
project.

### C2 — Turn on StoreKit verification

The verifier is written and tested against generated chains, including the
attack cases. Apple Root CA G3 is pinned from Apple's PKI distribution and the
in-house StoreKit 2 bridge compiles in the iOS target. What remains is the
permanent product ids and a real sandbox transaction.

- Keep the client catalogue, server allow-list, and App Store Connect product
  records aligned for `removeads` and `shuffle5`.
- App Store Server Notifications V2 endpoint, so refunds and family-sharing
  removal revoke the unlock without the app having to ask. Same verifier.
- Verify against a real sandbox purchase — that is what moves contract 8 from
  `configured` to `live_verified`.

The App Store record, permanent bundle ID, and both product records exist.
Review screenshots plus a real sandbox purchase/restore remain. D-005 is
settled.

### C3 — Ad reward verification

Google Mobile Ads and UMP are installed with production Hint, Revive, and
between-round units. The remaining gate is live rewarded-ad completion on a
physical device after Google's account verification. Only the native SDK's
earned-reward callback grants a Hint or Revive; dismissals and load failures do
not.

### C4 — Consumable grants — complete in source

Shuffle packs use the append-only consumable grant ledger in migration 0004.
They are repeatable, never restored as a non-consumable, and still require a
real sandbox transaction before release.

### C5 — Coach the mistake, not just the move — POST-PARITY

The coach explains the move it recommends. The teachable moment is the move the
player is about to get wrong.

- Look-ahead on player intent: when the tapped pair is legal but strands the
  other two of its group, say so *before* the move. Offer it, do not block it.
- Warn one move before an unavoidable deadlock. Once, quietly, no modal.
- Hint escalation: first tap points at a region, second names the tiles. Nobody
  gets the answer on the first ask.
- Extends `HintAnalysis` with the *candidate* move, not only the recommended
  one. TODO is marked in `packages/core/src/ai/hintCoach.ts`.

Not blocked. Can start now.

### C6 — Marketing site live

Static, one page, already written in `site/`. Needs a domain — **D-004** — and
nothing has been purchased.

---

## Codex — next (theirs to schedule)

Listed so the two roadmaps interlock, not to assign work. The parity doctrine
(D-014) moved most of the near-term weight to this side.

**Parity UI, in rough order.** The sequencing is already built and tested —
`@mahjong-brain/core/flow`, documented in [screen-flow.md](screen-flow.md). These
are views over it, not new logic.

- **The nine screens** — tos, age gate, loading, tutorial A/B/C, home, gameplay,
  game over. Visual spec is the Notion page; the machine handles order, gates,
  resume and instrumentation.
- **The holder** (D-015). A four-slot tray, tiles animating into it, the fill
  state, the loss state, and the Revive offer at the moment the fourth slot
  fills. `@mahjong-brain/core/play` gives you the whole state machine.
- **Level and progress surfaces** — `@mahjong-brain/core/progression`. Do not
  present the internal legacy `iq` field as a health, intelligence, or outcome
  claim in player-facing copy.
- **Ad and IAP surfaces** — Revive prompt, Hint rewarded-video prompt, Shuffle
  store. `PRODUCT_CATALOGUE` in `@mahjong-brain/core/contracts` is the source of truth.
- **Daily reward and streak UI** against contract 12.
- Real app icon and launch screen; portrait/landscape reflow without a redeal.
- Move rendering and UI into `apps/mobile/`, importing `@mahjong-brain/core`.
- WCAG 2.1 AA pass. **Accessibility is not retired by the parity doctrine** —
  it is part of the creative half, which stays ours.
- TestFlight submission cycle.

**Instrument as you go.** Every screen ships with its event from the catalogue
in the same PR. If an event you need is missing, open a contract PR.

**Where the ATT prompt goes is a real design decision** — see D-016. After a
first completed board reads far better than on cold launch, especially for a
60+ audience.

## Not in scope before TestFlight

Listed so they do not creep in:

- **The AI hint coach.** It is the one differentiation and it is deliberately
  post-parity — v0.2 or later, gated on what instrumentation says about teaching
  hints versus answer hints. The engine and routing are already built and idle.
- More layouts. Three is enough to validate; the ladder needs rungs, not variety.
- Android. Capacitor nearly gives it to us, but it splits review attention.
- Leaderboards and versus mode — parity items, but only once the incumbent's
  cadence is actually studied rather than guessed at.

---

## Open decisions blocking work

See [DECISIONS.md](DECISIONS.md).

| | Blocks |
|---|---|
| **D-001** final app name | Settled: Mahjong Brain / `com.nihi.mahjong` / Apple app `6800468742` |
| **D-004** domain — both candidates were available, nothing bought | C4 |
| **D-005** StoreKit bridge | Settled: in-house StoreKit 2 bridge with pinned Apple Root CA G3 |

---

## Day 30 after TestFlight

If D30 retention < 25% or paid conversion < 3% of installs: **pause**. Report
the miss and the cause, surface the options — difficulty curve, paywall timing,
audience, price, layouts, hint style — and Brent decides: iterate, pivot, park,
or stop.

The threshold forces the conversation. It does not make the decision, and
nothing shuts itself down on its own. See D-011.
