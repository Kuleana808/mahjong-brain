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
  1, 2, 5, 6 and 7 are `live_verified` and callable today.

---

## Claude Code — next

### C1 — Supabase project and the four blocked contracts

Unblocks 3, 4, 9, 10 in one go. Free tier.

- Postgres schema, append-only migrations: `accounts`, `settings`, `unlocks`,
  `sessions_analytics`.
- Real `StorePort` and `SessionPort` adapters behind the existing interfaces —
  the handlers do not change, only the ports get implementations.
- Apple identity-token verification: JWKS fetch and cache, signature check,
  issuer, audience, expiry. Audience is the bundle id, so this needs **D-001**.
- Row-level security so an account can only ever read its own row.

Blocked on: **D-001** (bundle id) and a Supabase project existing.

### C2 — StoreKit 2 receipt validation for real

- Implement `StoreKitPort`: JWS parse, leaf certificate extraction, chain
  validation to Apple's Root CA G3, payload checks.
- App Store Server Notifications V2 endpoint, so refunds and family-sharing
  removal revoke the unlock without the app having to ask.
- Sandbox verification against a real test purchase.

Blocked on: **D-005** (which StoreKit bridge Codex ships against).

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
