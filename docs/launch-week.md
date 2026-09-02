# Launch week

Compressed plan, Brent 2026-08-10. On-repo source of truth so Codex, future
sessions and Brent are reading the same thing.

> **Provenance.** This mirrors the launch plan **as relayed in the working
> session brief**, not the Notion page. The Notion page
> (`app.notion.com/p/3b7a1ddf…`) is private — an unauthenticated fetch returns
> the SPA shell, there is no local export, and a non-interactive session cannot
> run the Notion OAuth flow. Anything in Notion and not repeated to me is not
> below. If the two disagree, Notion wins and this file is wrong.

---

## Where things actually stand

### Contracts

Twelve, not eleven — 11 and 12 arrived with the parity doctrine.

| # | Contract | State | Needs |
|---|---|---|---|
| 1 | `game/board/generate` | **live_verified** | — |
| 2 | `game/board/validate-move` | **live_verified** | — |
| 3 | `auth/apple-id` | `configured` | a real Apple identity token round-trip |
| 4 | `settings` | **live_verified** | — (real Postgres 2026-08-11) |
| 5 | `hints/generate` | **live_verified** | — |
| 6 | `play-pattern/log` | **live_verified** | — |
| 7 | `difficulty/next-board` | **live_verified** | — |
| 8 | `receipts/validate` | `configured` | real sandbox purchase and restore still required |
| 9 | `unlock-status` | **live_verified** | — (real Postgres 2026-08-11) |
| 10 | `analytics/session` | **live_verified** | — (real Postgres 2026-08-11) |
| 11 | `events/batch` | **live_verified** | — 184 events into real Postgres |
| 12 | `retention/daily` | **live_verified** | — (real Postgres 2026-08-11) |

**On "live-verified end-to-end".** `live_verified` in this repo means *observed
working against the real thing* — that is the whole point of the state ladder,
so it should not be claimed loosely.

- 1, 2, 5, 6 and 7 are genuinely there. They are pure functions of the request,
  need no credentials, and never will.
- 4, 9, 10, 11 and 12 were observed against real Postgres on 2026-08-11.
- 3 remains `configured`: its verifier uses real signature checks, but a real
  Apple identity-token round trip has not yet been observed.
- 8 is `configured`: a 2026-08-14 production canary reached the verifier and
  rejected a malformed JWS as `unverified_transaction`, with no unlock. A real
  sandbox purchase and restore are still required for `live_verified`.

Calling 3 or 8 "live-verified" today would be the exact thing the state ladder
exists to prevent.

### Instrumentation

`npm run smoke:events` drives a real player through the real state machines,
collects what `eventsFor()` says to emit, posts it through the real handler and
reads back what landed. No mocks in the path.

The production smoke run stored **184 events across 38 distinct names** in the
dedicated Mahjong Brain project. The script prints unexercised catalogue events
rather than hiding them.

The linked Supabase CLI target was re-verified on 2026-08-14 as project
`dxtzbidjtkeekthompqb`; migrations 0001–0004 match. Do not rely on ambient
`SUPABASE_*` variables because another project also exists in the shell history.

### Marketing site

`apps/marketing/` — Next.js, `output: 'export'`, deploys to Cloudflare Pages as
plain HTML with no adapter or worker. Copy scaffold only; Codex owns the polish.
The App Store badge is a visible dashed placeholder rather than a look-alike,
because a convincing fake is the thing most likely to ship by accident.

`npm run marketing:dev` · `npm run marketing:build`

The production export, support page, and advertising-aware privacy page are live
at `https://mahjong-brain.pages.dev/`.

---

## Current release gates

| | Blocks | Note |
|---|---|---|
| **StoreKit sandbox proof** | contract 8, all purchases | Product records exist; purchase and clean-install restore remain unverified |
| **IAP review screenshots** | App Store product review | Both products remain Prepare for Submission |
| **AdMob account verification** | production fill and payout | SDK and units are configured; live fill/reward still needs device proof |
| **PR review and current archive** | TestFlight/App Review | PR #10 remains review-required; no archive exists for the current head |

### The bundle id, and a contradiction worth naming

Two instructions point opposite ways:

- 2026-08-09: *"build against … placeholder bundle ID (com.mahjongbrain.game)"* —
  done, merged in PR #8.
- 2026-08-10: *"no code committed against `com.mahjongbrain.game` without Brent
  confirming bundle ID (App Store record is permanent)."*

The App Store record now exists with bundle `com.nihi.mahjong` and Apple app ID
`6800468742`. Xcode successfully uploaded version 1.0 build 2 on 2026-08-11.
That binary predates the current PR head and is not the release candidate. See
[`release/RELEASE_STATUS.md`](../release/RELEASE_STATUS.md).

---

## Doctrine that governs the week

- **Parity before divergence** (D-014). v0.1 ships everything the incumbent
  ships, with original art and brand. The AI hint coach is post-parity.
- **Original art is the trademark firewall** (D-006). CI fails the build if a
  binary image lands in the render pipeline.
- **No launch without instrumentation** (D-016). No feature without a hypothesis
  and a metric.
- **Day 30 is an iteration trigger, not a kill switch** (D-011). If D30
  retention < 25% or paid conversion < 3%: pause, report the miss and the cause,
  surface options — difficulty curve, paywall timing, audience, price, layouts,
  hint style — and Brent decides: iterate, pivot, park, or stop. **Nothing shuts
  itself down.** No branch deleted, no infrastructure torn down, no "we're
  closing" message to a real user without an explicit yes.

## Ownership

| | |
|---|---|
| **Claude Code** | `packages/core/**`, `apps/api/**`, `apps/marketing/**` shell, `supabase/**`, contracts, instrumentation, docs |
| **Codex** | `apps/mobile/**`, `ios/**`, `src/render`, `src/ui`, the nine screens, visual language, art, marketing polish, TestFlight |

`-claude` and `codex/*` branches, `--force-with-lease`, PR only, green CI,
`git status` before writing a shared file, and a 24-hour deferral both ways.

## Commands

```bash
npm test                  # 327 tests
npm run smoke:events      # instrumentation end to end
npm run preflight         # pre-submission gate — run before any upload
npm run api               # contracts dev server, :5185
npm run marketing:dev     # marketing site, :5186
npm run dev               # the game, :5183
```
