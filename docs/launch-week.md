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
| 8 | `receipts/validate` | `source_available` | **D-005** — fails closed by design |
| 9 | `unlock-status` | **live_verified** | — (real Postgres 2026-08-11) |
| 10 | `analytics/session` | **live_verified** | — (real Postgres 2026-08-11) |
| 11 | `events/batch` | **live_verified** | — 165 events into real Postgres |
| 12 | `retention/daily` | **live_verified** | — (real Postgres 2026-08-11) |

**On "live-verified end-to-end".** `live_verified` in this repo means *observed
working against the real thing* — that is the whole point of the state ladder,
so it should not be claimed loosely.

- 1, 2, 5, 6 and 7 are genuinely there. They are pure functions of the request,
  need no credentials, and never will.
- 4, 9, 10, 11 and 12 were observed against real Postgres on 2026-08-11.
- 3 remains `configured`: its verifier uses real signature checks, but a real
  Apple identity-token round trip has not yet been observed.
- 8 stays `source_available` and fails closed until D-005 and a real sandbox
  transaction prove the installed bridge, product identifier, and certificate
  pin end to end.

Calling 3 or 8 "live-verified" today would be the exact thing the state ladder
exists to prevent.

### Instrumentation

`npm run smoke:events` drives a real player through the real state machines,
collects what `eventsFor()` says to emit, posts it through the real handler and
reads back what landed. No mocks in the path.

Last run against the dev store: **165 events, 39 distinct names, every one
stored.** Eighteen catalogue events were not exercised — abandonment paths,
permission prompts, settings — which a happy-path script cannot reach. The
script prints that list rather than hiding it.

The table above records an observed real-Postgres run on 2026-08-11. The current
shell credentials have not been proven to identify that same Mahjong Brain
project, so a release session must re-identify the target and repeat the smoke
test instead of relying on ambient environment variables.

### Marketing site

`apps/marketing/` — Next.js, `output: 'export'`, deploys to Cloudflare Pages as
plain HTML with no adapter or worker. Copy scaffold only; Codex owns the polish.
The App Store badge is a visible dashed placeholder rather than a look-alike,
because a convincing fake is the thing most likely to ship by accident.

`npm run marketing:dev` · `npm run marketing:build`

The old `site/index.html` is superseded and can go once Codex has moved in.

---

## Current release gates

| | Blocks | Note |
|---|---|---|
| **StoreKit product id** | contract 8, all purchases | Bundle ID is permanent; product record and sandbox verification remain |
| **Public support/privacy URLs** | App Store metadata and preflight | Marketing pages exist locally; deployment is unverified |
| **Production Supabase/API target** | account sync and release instrumentation | Current shell project is not identified as Mahjong Brain |
| **Ad network** | Revive and Hint revenue | Vendor decision |

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
npm test                  # 306 tests
npm run smoke:events      # instrumentation end to end
npm run preflight         # pre-submission gate — run before any upload
npm run api               # contracts dev server, :5185
npm run marketing:dev     # marketing site, :5186
npm run dev               # the game, :5183
```
