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
- **The schema** — `supabase/migrations/0001_init.sql`, append-only, RLS on.

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

### C3 — Coach the mistake, not just the move

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

### C4 — Marketing site live

Static, one page, already written in `site/`. Needs a domain — **D-004** — and
nothing has been purchased.

---

## Codex — next (theirs to schedule)

Listed so the two roadmaps interlock, not to assign work.

- Tile lift and land; board fill on start. The one place motion earns its keep.
- Real app icon and launch screen (currently Capacitor defaults).
- Portrait/landscape reflow without a redeal — the deal is seed-based, so this
  is a view concern only.
- Move rendering and UI into `apps/mobile/`, importing `@nihi/core`.
- Paywall and Restore Purchases UI against contracts 8 and 9. **Do not gate on
  contract 9** — the device entitlement is authoritative.
- WCAG 2.1 AA pass on the web build.
- TestFlight submission cycle.

---

## Not in scope before TestFlight

Listed so they do not creep in:

- More layouts. Three is enough to validate; the ladder needs rungs, not variety.
- Android. Capacitor nearly gives it to us, but it splits review attention.
- Sound. Original audio is a commissioning decision.
- Any account, leaderboard, or social feature.
- Anything that nudges a player to return. That is the whole point.

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
