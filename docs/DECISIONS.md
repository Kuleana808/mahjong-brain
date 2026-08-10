# Decisions

Running log. Each entry is either **settled** (decided, with the reasoning, so
nobody relitigates it) or **needs Brent** (blocked on a call only he makes).

---

## D-001 — Final app name · **LOCKED: Mahjong Brain** (Brent, 2026-08-09)

Repo renamed to `Kuleana808/mahjong-brain` (GitHub redirects the old URLs, so
existing clones and links keep working). Package scope is `@mahjong-brain/core`.
Local path is `~/mahjong-brain`.

### The bundle id is NOT locked, and stays unlocked on purpose

Everything named `com.nihi.*` still reads that way — the product ids in
`PRODUCT_CATALOGUE`, `appId` in `capacitor.config.ts`, and the iOS project. That
is deliberate, not an oversight. The bundle id creates the App Store record and
cannot be changed afterwards without a new listing, so guessing it and changing
it twice is worse than leaving one obvious pending value.

Candidates:

| | Notes |
|---|---|
| `com.mahjongbrain.game` | Reads best. Implies we own `mahjongbrain.com`, which **we do not** — see D-004. |
| `com.kuleana.mahjongbrain` | Ties to a domain Brent controls. Reverse-DNS convention actually satisfied. |
| `com.kuleana808.mahjongbrain` | Matches the GitHub org exactly. |

Recommendation: **`com.kuleana.mahjongbrain`**. Apple does not verify domain
ownership, so `com.mahjongbrain.game` would be accepted — but the convention is
reverse-DNS of a domain you control, and `mahjongbrain.com` belongs to someone
else. Naming ourselves after a domain another party registered three months ago
is a bad look if the name is ever disputed.

Changing it is a three-line change once decided: `capacitor.config.ts`,
`PRODUCT_CATALOGUE`, and the `APPLE_BUNDLE_ID` env var (contract 3's audience).
The iOS project is Codex's to update.

### Still outstanding

**No trademark search has been run on "Mahjong Brain".** Worth doing before the
App Store record exists, and see the D-004 note — someone registered
`mahjongbrain.com` in May 2026.

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

## D-004 — Domain · **NEEDS BRENT (nothing purchased)**

Rechecked 2026-08-09 against the locked name:

| Domain | Status |
|---|---|
| `mahjongbrain.com` | **TAKEN** — registered 2026-05-25 via Dynadot, behind Cloudflare, currently serving a 404 |
| `mahjongbrain.app` | whois inconclusive (the `.app` registry restricts it) — needs a registrar check |
| `mahjongbrain.game` | **available** |
| `mahjong-brain.com` | **available** |

The `.com` being taken matters more than as an inconvenience. It was registered
about three months ago, it resolves through Cloudflare, and it serves nothing —
which is either a squatter or somebody building under the same name. Either way
it is worth knowing before the name goes on an App Store listing, and it feeds
directly into the bundle-id recommendation in D-001.

`mahjong-brain.com` is the cheapest clean option and matches the repo name.
Nothing has been purchased; per the standing rule every purchase needs an
explicit yes.

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

---

## D-009 — Boards are seed-only, not server-authoritative · **SETTLED**

The brief left contract 1 open: "server-authoritative or seed-only". It is
**seed-only**.

A server-authoritative board needs a session before the first tile appears and a
round trip before the first tap. That breaks two non-negotiables simultaneously:
*no login required for free play*, and *one tap to start*. Neither survives a
spinner on a train.

A seed plus a layout reproduces the board exactly and deterministically on any
device, offline. The server can still verify any position later by replaying the
same seed — which is exactly what contract 2 does, with no server-side session
state at all.

The objection is that the client can see the whole board. True, and irrelevant:
single player, no leaderboard, no score, no currency, nobody to cheat. Revisit
only if a competitive mode ever appears.

---

## D-010 — Two-agent split, contracts as the seam · **SETTLED (Brent, 2026-08-09)**

| | Owns |
|---|---|
| **Claude Code** | `packages/core/**`, `apps/api/**`, auth, settings sync, AI routing, StoreKit receipt validation, `site/`, `docs/` |
| **Codex** | `apps/mobile/**`, `ios/**`, tile rendering, calm-first visual language, accessibility, StoreKit UI and paywall screen, TestFlight |

Consequences already applied:

- The game engine and AI routing moved from `src/` to `packages/core/`. Nothing
  in `src/render`, `src/ui`, `src/state` or `ios/` was edited to do it —
  tooling updated the import paths, and `@mahjong-brain/core` is the supported entry
  point going forward.
- Every endpoint answers in the 5-state envelope, so Codex can build against
  contracts that are not configured yet and see exactly what is missing.
- `main` protected, `-claude` and `codex/*` branch prefixes,
  `--force-with-lease`, PR-only, green CI before merge, and a 24-hour
  same-file deferral rule in both directions.

The tile renderer question (PixiJS vs Canvas) now belongs to Codex. D-002 records
why Canvas won the first evaluation and what would justify revisiting it; the
decision is theirs to keep or overturn.

---

## D-011 — The day-30 threshold is an iteration trigger, not a kill switch · **SETTLED (Brent, 2026-08-09)**

Superseded: the earlier "D30 retention < 25% or paid conversion < 3% → the
project is killed."

Now: at day 30 post-TestFlight, if either number misses, **pause**. Report the
miss and the underlying cause, put the options on the table — difficulty curve,
paywall timing, audience, price, layouts, hint style — and Brent decides:
iterate, pivot, park, or stop.

The measurement bar is unchanged. What changed is what happens when it is hit:
the threshold forces the conversation, it does not make the decision. Nothing
shuts itself down — no branch deleted, no infrastructure torn down, no
"we're closing" message to a real user — without Brent saying so first.

Brent, verbatim: *"Don't give kill instructions. I want to be able to iterate."*

---

## D-012 — WebCrypto only, no crypto libraries · **SETTLED**

Apple identity tokens and StoreKit transactions both need real signature
verification. The obvious moves would be `jose` for JWS and Node's
`crypto.X509Certificate` for the chain. Neither is used, and the reason is
portability, not purity: `apps/api` is a dev server today and a **Supabase Edge
Function** in production, and Edge Functions do not have Node's `crypto` module.
WebCrypto exists in Node, in Deno, in workerd and in the browser.

So the code is WebCrypto plus about 130 lines of DER reading
(`apps/api/src/adapters/crypto/der.ts`) for the one thing WebCrypto cannot do:
parse a certificate. The same files run unmodified in both places.

What that buys and costs:

- **Buys:** no dependency to audit, no supply-chain surface on the path that
  guards the paywall, and one implementation instead of two.
- **Costs:** we own the DER reader. It is deliberately minimal — it reads four
  fields and refuses everything else — and it must not grow into a general
  ASN.1 library. If it needs to, take the dependency instead.

Tested with real keys, real signatures and real certificate chains generated in
the test, including the attacks each check exists to stop: a token minted for
another app, a self-rooted certificate chain, a forged chain link, a tampered
payload, `alg: none`, and a purchase for someone else's product.

---

## D-013 — An in-process dev store, so Codex is not blocked on Supabase · **SETTLED**

Contracts 3, 4, 9 and 10 all need somewhere to put rows, and there is no
Supabase project yet (D-001 blocks part of it). Rather than leave four endpoints
dark while Codex builds sign-in and paywall UI against them, `StorePort` has a
second implementation that keeps everything in process, optionally persisted to
a JSON file.

`MAHJONG_BRAIN_DEV_STORE=memory` turns it on. It is ignored whenever real Supabase
credentials are present, so it cannot be reached in production by accident.

The important property: **nothing else changes.** Same handlers, same envelopes,
same request and response shapes, same real Apple token verification. Only the
row storage differs. When Supabase lands, Codex's UI does not move.

---

## D-014 — Parity before divergence · **SETTLED (Brent, 2026-08-09)**

> Brent, verbatim: *"The developer doesn't own the right to not copy until
> you're at complete parity. The things that should be original are the art work
> and creative."*

v0.1 ships at **functional parity with the incumbent**, not as our own take.
Differentiation is a right earned after parity with cohort data, not a design
preference exercised before it.

**Copied until parity is proven:** onboarding beat for beat (age gate, TOS
modal, loading quote, progressive tutorial with confetti on first pair),
monetisation (ads on Revive, rewarded video for Hint, IAP for Shuffle),
retention loops (daily reward, streaks, seasonal events), social hooks,
live-ops cadence, tutorial pacing, difficulty curve, UI patterns, error states.

**Original from day one, non-negotiable:** tile art, any mascot, brand — name,
logo, wordmark, palette — and all marketing copy. This is both the
anti-litigation layer and the only thing that makes it a product rather than a
reskin. See D-006.

**Post-parity, gated on data:** the AI hint coach that teaches holder
management. It is our one differentiation and it ships in v0.2 or later, after
v0.1 hits parity and instrumentation shows what teaching hints change.

### What this retires

Everything in the original brief that began "we won't have". Specifically:

- **"$4.99 lifetime unlock, no ads, not even in the free tier."** Retired.
  `remove_ads` survives as one product among several and as a post-launch A/B
  test, not as the launch positioning.
- **"Zero timers, zero streaks, zero come-back-tomorrow nudges."** Retired.
  Daily reward and streaks are contract 12.
- **"No analytics vendors."** Half-retired — still no third-party SDK, but
  instrumentation is now mandatory rather than avoided. See D-016.

The calm visual language and the accessibility bar are **not** retired. Those
are art and creative, which is the half that stays ours.

---

## D-015 — The engine needed a four-slot holder · **SETTLED**

The scope note said the core mechanic was "already correct". It was not, and
this is worth recording because it was a real gap rather than a preference.

The engine shipped **classic direct-pair solitaire**: tap two free tiles and
they clear. The parity mechanic is different — tap a free tile and it goes into
a **four-slot holder**; two matching tiles in the holder clear; filling all four
with no match ends the run.

That third rule is not a detail. **A full holder is the entire monetisation
surface.** Revive exists because the holder fills, and Shuffle and Hint exist to
postpone it. Without the holder there is nowhere to put a single revenue hook,
so no amount of copying the monetisation would have produced the incumbent's
loop.

Implemented in `packages/core/src/play/` as a session state machine on top of
the existing board. Direct-pair play in `game/board.ts` is untouched and still
exported, so the current UI keeps working while Codex migrates.

Solvability survives: a deal built backwards from a valid removal order is still
winnable, because the player can take that order's two tiles consecutively and
clear them out of the holder immediately.

**Codex:** the live UI is built for direct-pair. Moving to the holder is a real
UI change — a holder tray, a fill animation, a loss state, and the Revive offer
at the moment it fills.

---

## D-016 — Instrumentation, and what it does to the privacy posture · **SETTLED, with a flag for Brent**

Instrumentation is mandatory before launch. Contract 11 ships a closed event
catalogue covering every onboarding screen, every tap, every holder fill, every
ad and IAP funnel step, and D1/D7/D30 cohorts.

**No new vendor.** The doctrine offered PostHog free tier or a Supabase custom
event log; this is the Supabase one. PostHog would be a vendor, and vendors need
an explicit yes even at $0 — so choosing it would have blocked on approval for
no capability we need at 50-100 users. Revisit when the cohort review outgrows
SQL.

The protection moved from "ask first" to "cannot identify anyone": first-party
storage only, a rotating resettable device id, a closed event catalogue, an
allow-listed property set, and **no `account_id` column on the events table** so
product analytics cannot be joined to an identity even from inside the database.

### The flag — ads change this, and Brent should know before we ship them

Product analytics as built is not tracking, and the App Store privacy label can
honestly stay at "Data Not Linked to You". **Wiring an ad SDK changes that**,
and the change is not ours to opt out of:

- AdMob or Unity Ads collect an advertising identifier. That is tracking, and on
  iOS it requires an **App Tracking Transparency prompt** before the first ad.
- The privacy nutrition label gains "Identifiers" and "Data Used to Track You".
- ATT opt-in rates are low, and non-consented users are served far cheaper
  contextual ads — so the revenue model has to survive most users saying no.
- Our audience is 60+. An ATT prompt on first launch, before anyone has played,
  is a hard moment in an onboarding flow otherwise designed to be gentle.
- **If an age gate is shipped and anyone under 13 can pass it**, COPPA and the
  Kids category rules apply and personalised ads are not permitted at all.

None of this argues against ads — the doctrine settled that. It argues for
deciding *where the ATT prompt goes* deliberately (after the first completed
board reads better than on launch) and for pricing the model on contextual
rather than personalised fill.

---

## D-005 — StoreKit bridge · **UPDATED for parity monetisation**

Superseded scope, not the recommendation. The original entry assumed **one
non-consumable** (`remove_ads`). Parity monetisation needs **consumables** too —
Shuffle packs at minimum — which changes what the bridge has to do:

- consumable purchases finish and can repeat, so the client must call
  `finish()` and the server must not dedupe on `originalTransactionId` for them
- `unlocks.original_transaction_id` being UNIQUE is right for `remove_ads` and
  wrong for consumables; consumable grants need their own table
- restore only applies to the non-consumable

The recommendation still stands: an in-house StoreKit 2 plugin over RevenueCat,
and RevenueCat only if consumable receipt handling turns out to be more than a
day. The product catalogue now lives in
`packages/core/src/contracts/types.ts` as `PRODUCT_CATALOGUE`.
