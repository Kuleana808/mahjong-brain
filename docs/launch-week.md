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
| 3 | `auth/apple-id` | `configured` | a Supabase project |
| 4 | `settings` | `configured` | a Supabase project |
| 5 | `hints/generate` | **live_verified** | — |
| 6 | `play-pattern/log` | **live_verified** | — |
| 7 | `difficulty/next-board` | **live_verified** | — |
| 8 | `receipts/validate` | `source_available` | **D-005** — fails closed by design |
| 9 | `unlock-status` | `configured` | a Supabase project |
| 10 | `analytics/session` | `configured` | a Supabase project |
| 11 | `events/batch` | `configured` | a Supabase project |
| 12 | `retention/daily` | `configured` | a Supabase project |

**On "live-verified end-to-end".** `live_verified` in this repo means *observed
working against the real thing* — that is the whole point of the state ladder,
so it should not be claimed loosely.

- 1, 2, 5, 6 and 7 are genuinely there. They are pure functions of the request,
  need no credentials, and never will.
- 3, 4, 9, 10, 11 and 12 are **`configured` and verified end to end against the
  in-process dev store**, with real Apple token verification and real signature
  checks in the path. They are one environment variable pair away from
  `live_verified`, and **that pair does not exist yet** — there is no Supabase
  project, and creating one needs an account this session cannot reach.
- 8 stays `source_available` and fails closed until D-005.

Calling 3/4/9/10/11/12 "live-verified" today would be the exact thing the state
ladder exists to prevent.

### Instrumentation

`npm run smoke:events` drives a real player through the real state machines,
collects what `eventsFor()` says to emit, posts it through the real handler and
reads back what landed. No mocks in the path.

Last run against the dev store: **165 events, 39 distinct names, every one
stored.** Eighteen catalogue events were not exercised — abandonment paths,
permission prompts, settings — which a happy-path script cannot reach. The
script prints that list rather than hiding it.

Against a real Supabase project it is the same command with two env vars, and it
exits non-zero if a single event fails to arrive. **That run has not happened.**

### Marketing site

`apps/marketing/` — Next.js, `output: 'export'`, deploys to Cloudflare Pages as
plain HTML with no adapter or worker. Copy scaffold only; Codex owns the polish.
The App Store badge is a visible dashed placeholder rather than a look-alike,
because a convincing fake is the thing most likely to ship by accident.

`npm run marketing:dev` · `npm run marketing:build`

The old `site/index.html` is superseded and can go once Codex has moved in.

---

## Blocked on Brent

| | Blocks | Note |
|---|---|---|
| **Original tile art** — commission or generate | public release | Day 1 blocker. Tile faces are drawn in code and are original; the **app icon and splash are still Capacitor defaults** |
| **D-005** StoreKit bridge + Apple Root CA G3 | contract 8, all purchases | Fails closed until then, deliberately |
| **Bundle id** confirmation | first upload, permanently | See below |
| **Supabase project** | six contracts to `live_verified`, and instrumentation | Free tier |
| **Ad network** | Revive and Hint revenue | Vendor decision |

### The bundle id, and a contradiction worth naming

Two instructions point opposite ways:

- 2026-08-09: *"build against … placeholder bundle ID (com.mahjongbrain.game)"* —
  done, merged in PR #8.
- 2026-08-10: *"no code committed against `com.mahjongbrain.game` without Brent
  confirming bundle ID (App Store record is permanent)."*

The risk being guarded against is real but it lands at **first upload**, not at
commit. Nothing has been submitted, so nothing is permanent yet.

Resolution: the placeholder stays where it is useful, and `npm run preflight`
makes submitting with it impossible by accident. It currently exits 1 with three
blockers. **Run it before any TestFlight upload.**

If the preference is to strip the placeholder from the code anyway, say so and
it is a five-minute change — but it would leave a dead brand or an empty string
in its place, which is worse to work against.

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
npm test                  # 231 tests
npm run smoke:events      # instrumentation end to end
npm run preflight         # pre-submission gate — run before any upload
npm run api               # contracts dev server, :5185
npm run marketing:dev     # marketing site, :5186
npm run dev               # the game, :5183
```
