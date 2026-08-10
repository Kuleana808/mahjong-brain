# Roadmap to TestFlight

Two agents build this. Contracts are the seam — see
[api-contracts.md](api-contracts.md) and D-010.

| | Owns |
|---|---|
| **Claude Code** | `packages/core/**`, `apps/api/**`, auth, settings sync, AI routing, receipt validation, `site/`, `docs/` |
| **Codex** | `apps/mobile/**`, `ios/**`, tile rendering, visual language, accessibility, StoreKit UI, TestFlight |

Target is TestFlight in 2–4 weeks. TODOs are marked at the call sites too, so
the work is findable from where it happens.

---

## Done

- **Scaffold** — playable board end to end, 87 tests, iOS builds clean on
  Xcode 26.
- **`packages/core`** — game engine and AI hint routing extracted, runtime-
  agnostic, importable as `@nihi/core`.
- **The ten contracts** — shapes, handlers, 5-state envelope, dev server.
- **The adapters** — Apple identity verification, HMAC sessions, StoreKit 2 JWS
  with full `x5c` chain validation, a Supabase store over PostgREST, and an
  in-process dev store. 1, 2, 5, 6, 7 are live; 3, 4, 9, 10 work today against
  the dev store; 8 fails closed until its root is pinned.
- **The schema** — `supabase/migrations/`, append-only, RLS on, cohort views.
- **The holder mechanic** (D-015) — `@nihi/core/play`, the parity loop.
- **Instrumentation** (contract 11) — closed event catalogue covering every
  onboarding screen, tap, holder fill, ad and IAP funnel step, plus D1/D7/D30
  cohort views.
- **Daily reward and streaks** (contract 12).

---

## Claude Code — next

### C1 — Stand up the Supabase project

The adapters are written and tested. What is missing is a project to point them
at. Free tier.

- Create the project; run `supabase/migrations/0001_init.sql`.
- Set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` and contracts 4, 9 and 10 go
  from the dev store to real rows with no code change.
- Set `APPLE_BUNDLE_ID` and contract 3 goes live — the Apple verifier is already
  written, tested against real signatures, and only needs an audience to check.
- Deploy `handle()` as an Edge Function. The router is transport-independent and
  the adapters use `fetch`, not the Supabase SDK, so this is packaging, not a
  port.

Blocked on: **D-001** (bundle id) and a Supabase project existing.

### C2 — Turn on StoreKit verification

The verifier is written and tested against generated chains, including the
attack cases. What is missing is the pinned root and the product id.

- Download Apple Root CA G3, base64 it into `APPLE_ROOT_CA_G3_BASE64`.
- Set `IAP_PRODUCT_ID`.
- App Store Server Notifications V2 endpoint, so refunds and family-sharing
  removal revoke the unlock without the app having to ask. Same verifier.
- Verify against a real sandbox purchase — that is what moves contract 8 from
  `configured` to `live_verified`.

Blocked on: **D-005** (which StoreKit bridge Codex ships against) and an App
Store Connect record.

### C3 — Ad reward verification (contract 13)

Blocked on an ad network being chosen, which is a vendor decision and needs a
yes. Same fail-closed pattern as contract 8: the network calls us signed, and a
client-side "the ad finished" is instrumentation, not entitlement.

### C4 — Consumable grants

Contract 8 currently models one non-consumable. Shuffle packs are consumables:
repeatable purchases, no restore, and `unlocks.original_transaction_id` being
UNIQUE is wrong for them. Needs its own table and a migration. See D-005.

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

**Parity UI, in rough order:**

- **The holder** (D-015). A four-slot tray, tiles animating into it, the fill
  state, the loss state, and the Revive offer at the moment the fourth slot
  fills. `@nihi/core/play` gives you the whole state machine.
- **Onboarding, beat for beat** — age gate, TOS-accept modal, motivational
  loading quote, progressive tutorial with confetti on the first cleared pair.
- **Ad and IAP surfaces** — Revive prompt, Hint rewarded-video prompt, Shuffle
  store. `PRODUCT_CATALOGUE` in `@nihi/core/contracts` is the source of truth.
- **Daily reward and streak UI** against contract 12.
- Real app icon and launch screen; portrait/landscape reflow without a redeal.
- Move rendering and UI into `apps/mobile/`, importing `@nihi/core`.
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
- Sound. Original audio is a commissioning decision.
- Leaderboards and versus mode — parity items, but only once the incumbent's
  cadence is actually studied rather than guessed at.

---

## Open decisions blocking work

See [DECISIONS.md](DECISIONS.md).

| | Blocks |
|---|---|
| **D-001** final app name | C1, and the App Store record is permanent |
| **D-004** domain — both candidates were available, nothing bought | C4 |
| **D-005** StoreKit bridge | C2 |

---

## Day 30 after TestFlight

If D30 retention < 25% or paid conversion < 3% of installs: **pause**. Report
the miss and the cause, surface the options — difficulty curve, paywall timing,
audience, price, layouts, hint style — and Brent decides: iterate, pivot, park,
or stop.

The threshold forces the conversation. It does not make the decision, and
nothing shuts itself down on its own. See D-011.
