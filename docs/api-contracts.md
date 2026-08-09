# API contracts

This document is the interface between the two halves of the build. Claude Code
produces these shapes; Codex consumes them. **Changing a shape here is a PR both
sides review** — neither side pushes work across the line without one.

- Types: [`packages/core/src/contracts/types.ts`](../packages/core/src/contracts/types.ts)
- Handlers: [`packages/core/src/contracts/handlers/`](../packages/core/src/contracts/handlers/)
- Tests that keep this honest: [`contracts.test.ts`](../packages/core/src/contracts/__tests__/contracts.test.ts)

- Adapters: [`apps/api/src/adapters/`](../apps/api/src/adapters/)
- Schema: [`supabase/migrations/`](../supabase/migrations/)

Run them locally:

```bash
npm run api          # http://localhost:5185
curl "localhost:5185/api/game/board/generate?layout=turtle&seed=42"
```

### A fully working local backend, no Supabase needed

Contracts 3, 4, 9 and 10 light up completely against an in-process store:

```bash
NIHI_DEV_STORE=memory \
SESSION_SIGNING_KEY=$(openssl rand -hex 32) \
APPLE_BUNDLE_ID=com.nihi.mahjong \
npm run api
```

Add `NIHI_DEV_STORE_FILE=./.nihi-dev-store.json` to survive restarts. The boot
banner prints exactly which ports came up:

```
nihi contracts API on http://localhost:5185
  store       in-memory (dev)
  session     hs256
  apple       verifying aud=com.nihi.mahjong
  storekit    none — set APPLE_ROOT_CA_G3_BASE64, IAP_PRODUCT_ID (blocked on D-005)
  contracts 1, 2, 5, 6, 7 need none of the above and are always live
```

Same handlers, same envelopes, same everything — only the row storage differs.
`NIHI_DEV_STORE=memory` is ignored whenever real Supabase credentials are set.

Production target is Supabase Edge Functions wrapping the same
`handle()` from `apps/api/src/router.ts`. The dev server is Node's built-in
`http` with no framework, so there is nothing to port.

---

## The envelope

Every endpoint answers in this shape, always — including when it cannot do the
thing asked of it.

```jsonc
{
  "contract": "game/board/generate",
  "version": "1",
  "state": "live_verified",
  "fallback_reason": null,
  "data": { /* contract-specific, or null */ },
  "error": null,
  "generated_at": "2026-08-09T22:44:11.272Z"
}
```

### The five states

Four of them are a readiness ladder, in order:

| State | Means |
|---|---|
| `source_available` | The code path exists and runs. Nobody has configured it. |
| `configured` | Its keys, env vars and webhooks are set in this environment. |
| `live_verified` | Observed working end to end against the real thing. |
| `requires_review` | A human has to look before this can proceed. |

`fallback_reason` is the fifth, and it is **orthogonal to the other four**: it is
set whenever the answer is degraded, and says why in plain words.

A response can be `live_verified` *and* carry a fallback reason — the hint coach
does exactly that when Ollama is down and the offline explainer answers instead.
The recommendation is real and verified; the phrasing is the plain one.

> **If `fallback_reason` is `null`, you got the real thing.** A degraded answer
> is never silent.

### Errors

```jsonc
{ "code": "invalid_request", "message": "Seed must be an integer.", "field": "seed" }
```

`message` is safe to show a player. `code` is stable and machine-readable.

| Code | HTTP | Meaning |
|---|---|---|
| `invalid_request` | 400 | Request shape is wrong. `field` names the offender. |
| `unknown_layout` | 400 | Not one of `turtle`, `pyramid`, `dragon`. |
| `unauthenticated` | 401 | No valid session. |
| `not_found` | 404 | No contract at that path. |
| `not_configured` | 503 | Real endpoint, missing credentials. `fallback_reason` lists them. |
| `no_moves`, `unverified_transaction` | 200 / 500 | Contract-specific; see below. |

---

## Readiness right now

All ten are implemented. What varies is whether the credentials exist.

| # | Contract | Out of the box | With the dev store | In production, needs |
|---|---|---|---|---|
| 1 | `GET /api/game/board/generate` | `live_verified` | `live_verified` | nothing |
| 2 | `POST /api/game/board/validate-move` | `live_verified` | `live_verified` | nothing |
| 3 | `POST /api/auth/apple-id` | `source_available` | **`configured`** | `APPLE_BUNDLE_ID` (D-001) + Supabase |
| 4 | `GET`/`PATCH /api/settings` | `source_available` | **`configured`** | Supabase |
| 5 | `POST /api/hints/generate` | `live_verified` | `live_verified` | nothing |
| 6 | `POST /api/play-pattern/log` | `live_verified` | `live_verified` | nothing |
| 7 | `GET /api/difficulty/next-board` | `live_verified` | `live_verified` | nothing |
| 8 | `POST /api/receipts/validate` | `source_available` | `source_available` | Apple root CA + product id (D-005) |
| 9 | `GET /api/unlock-status` | `source_available` | **`configured`** | Supabase |
| 10 | `POST /api/analytics/session` | `source_available` | **`configured`** | Supabase |

**1, 2, 5, 6 and 7 need no credentials and never will** — they are pure functions
of the request.

**3, 4, 9 and 10 work right now** against the dev store (see above). Real Apple
identity tokens are verified for real; only the row storage is in-process.

**8 is the one that stays dark**, deliberately. It needs Apple Root CA G3 pinned,
and it fails closed until it has it — see below.

### `state` distinguishes "not deployed" from "you sent something wrong"

This matters for reading the table above. A working verifier rejecting a bad
token answers `configured` with an `unauthenticated` error. An endpoint nobody
has deployed answers `source_available` with `not_configured`. Both are 4xx/5xx,
and they mean completely different things:

| You see | It means |
|---|---|
| `source_available` + `not_configured` | Nobody has set the keys. Not your bug. |
| `configured` + `unauthenticated` | The endpoint works. Your token was refused. |
| `configured` + `unverified_transaction` | The verifier works. That transaction failed it. |

---

## 1. `GET /api/game/board/generate`

**Seed-only, not server-authoritative.** This was left open in the brief; here
is the call and why, because it is load-bearing.

A server-authoritative board would need a session before the first tile appears
and a round trip before the first tap. That breaks two non-negotiables at once:
*no login required for free play*, and *one tap to start*. A seed plus a layout
reproduces the board **exactly and deterministically on any device, offline** —
so the client can deal instantly and the server can still verify anything later
by replaying the same seed.

The obvious objection is that the client can see the whole board. True, and it
does not matter: single player, no leaderboard, no score, no currency, nobody to
cheat. Revisit only if a competitive mode ever appears.

**Query**

| Param | Type | Notes |
|---|---|---|
| `layout` | `turtle \| pyramid \| dragon` | Required. |
| `seed` | integer | Omit for a new board. |
| `includeTiles` | `true` | Debug / cross-check. Off by default. |

**Response**

```jsonc
{
  "layout": "turtle",
  "seed": 42,
  "tileCount": 144,
  "layerCount": 5,
  "solvable": true,          // guaranteed by construction, always true
  "openingMoves": 16,
  "tiles": null              // or [{ id, x, y, z, face: { suit, rank } }]
}
```

Coordinates are in **tile units**: a tile occupies exactly 1.0 × 1.0 and sits at
integer or half-integer offsets. Half offsets are what give the classic layouts
their stagger, so `x` and `y` are floats. `z` is the layer, 0 at the bottom.

`solvable` is always `true` and is not a claim we hope holds — the deal is built
backwards from a valid removal order, so a winning line exists by construction.

---

## 2. `POST /api/game/board/validate-move`

Server-side truth with **no server-side session state**: the seed reproduces the
board, `removed` replays the history, and the resulting position is checked.

**Request**

```jsonc
{
  "layout": "turtle",
  "seed": 42,
  "removed": [[12, 87], [3, 40]],   // pairs already taken, in order
  "move": [55, 61]                  // the pair being attempted
}
```

**Response**

```jsonc
{
  "valid": false,
  "reason": "faces_do_not_match",
  "tilesRemaining": 140,
  "movesRemaining": 14,
  "boardComplete": false,
  "boardStuck": false
}
```

`reason` is one of `ok`, `same_tile`, `already_removed`, `faces_do_not_match`,
`first_tile_blocked`, `second_tile_blocked`, `replay_diverged`.

`replay_diverged` means the `removed` history could not have happened on this
board. That is the anti-tamper signal, and also — much more often — the signal
that a client and server disagree about the rules. Log it, do not show it.

> **A reason is for us, not for the player.** The UI must never scold. A refused
> tap reselects; it does not lecture.

---

## 3. `POST /api/auth/apple-id`

Sign in with Apple, used **only** to sync settings and the unlock across a
player's own devices. Free play never requires it, and the game stays fully
playable for someone who never signs in.

**Request** `{ "identityToken": "<JWS>", "userIdentifier": "<optional>" }`

**Response** `{ "sessionToken", "expiresAt", "accountId", "created" }`

The token is accepted only when the signature verifies against Apple's published
keys, the issuer is Apple, the audience is our bundle id, and it has not expired.
There is no trust-the-client path — the same account carries the purchase
unlock. Apple's `sub` is the key; the email may be a relay address and is never
used as an identifier.

**Implemented and testable now.** With `APPLE_BUNDLE_ID` set and the dev store
running, real identity tokens are verified for real: JWKS fetched from
`https://appleid.apple.com/auth/keys` and cached for a day, RS256 signature
checked, `kid` re-fetched once on a miss in case Apple rotated, `iss` and `aud`
and `exp` all enforced, `alg` pinned so `alg: none` and algorithm confusion are
closed.

Rejections answer `configured` + `unauthenticated` with the player-safe message
*"That sign-in could not be verified."* — the actual reason goes in
`fallback_reason`, never in `message`, because the endpoint is otherwise an
oracle for probing tokens.

Without `APPLE_BUNDLE_ID` it answers `source_available` + `not_configured` and
names what is missing (HTTP 503). Request-shape validation runs first either
way, so a malformed token gets `invalid_request` even while unconfigured.

---

## 4. `GET /api/settings` · `PATCH /api/settings`

`Authorization: Bearer <sessionToken>`.

```jsonc
{
  "settings": {
    "theme": "system",              // calm | calm-dark | high-contrast | system
    "fontScale": 1,                 // 0.8–2.0; the UI offers 1, 1.2, 1.45
    "reduceMotion": false,
    "dimBlocked": true,
    "haptics": true,
    "difficultyPreference": "auto"  // auto | gentle | standard | demanding
  },
  "updatedAt": "2026-08-09T22:44:11.272Z",
  "revision": 3
}
```

`PATCH` takes any subset, plus an optional `ifRevision`.

**Conflicts resolve by revision, not by clock** — two devices can disagree about
the time, but not about which revision they last saw. A stale `ifRevision` gets
back the *current* values with a `fallback_reason` explaining that nothing was
written, rather than silently winning or silently losing.

Out-of-range values are **refused, not coerced** (`invalid_request` with `field`).

`difficultyPreference` is a player override. The game itself only ever writes
`auto` — see contract 7.

---

## 5. `POST /api/hints/generate`

**Request**

```jsonc
{
  "layout": "turtle",
  "seed": 42,
  "removed": [[12, 87]],
  "allowModelPhrasing": false   // true only for players who bought the unlock
}
```

**Response**

```jsonc
{
  "pair": [55, 61],
  "text": "Look at the top-left corner and the middle of the board — the two Orchid (Flower) tiles there. Taking them releases five more tiles, including five from the layer underneath.",
  "summary": "Two Orchid (Flower) tiles, the top-left corner and the middle of the board.",
  "tier": "offline",
  "latencyMs": 3
}
```

`text` teaches the pattern; it never says "the answer is". It never contains
coordinates — there is a test asserting that. `summary` is one line, for the
`aria-live` announcement.

**Routing.** The offline explainer answers by default: instant, free, works on a
plane. Ollama rewords the *same structured analysis* when it is reachable, the
caller has the unlock, and it answers inside a hard 1.5s budget. A frontier model
is not wired — that is spend, and spend needs an explicit yes.

Because the analysis is shared, **the recommendation is identical whichever tier
answers.** Only the sentence changes. So a free player does not get a worse hint;
they get a plainer one. When model phrasing was requested and not obtained, the
envelope says so:

```
"fallback_reason": "Ollama unavailable or over its latency budget; answered with the offline explainer. Recommendation is unchanged."
```

`no_moves` (with `state: live_verified`) means the board has no pair left. That
is a real answer, not a failure — pair it with the shuffle affordance.

---

## 6. `POST /api/play-pattern/log`

**Request**

```jsonc
{
  "layout": "turtle",
  "completed": true,
  "movesPlayed": 72,
  "hintsUsed": 3,
  "elapsedSeconds": 384,
  "profile": { /* SkillProfileWire, omit on a first-ever board */ }
}
```

**Response** `{ "profile", "skillScore", "accepted", "ignoredReason" }`

The server runs the same model the client runs locally — deliberately. It is a
*sync point*, not a second brain, so a player offline for a week gets the same
adaptation they would have got online and nothing jumps when they reconnect.

A board that ended under 5 moves is counted as played but excluded from the
averages, with `ignoredReason` saying so. That is not skill data; that is the
phone ringing.

`SkillProfileWire`:

```jsonc
{
  "secondsPerMove": 5.3,   // null until the first meaningful board
  "hintRate": 0.04,
  "completionRate": 0.8,
  "boardsPlayed": 12,
  "boardsCompleted": 9,
  "lastLayoutId": "turtle"
}
```

---

## 7. `GET /api/difficulty/next-board`

`?profile=<url-encoded SkillProfileWire JSON>`, or omit for a first board.

```jsonc
{
  "layout": "pyramid",
  "seed": 998877,
  "tileCount": 144,
  "rationale": "No history yet, so the gentlest layout.",
  "skillScore": 0.25
}
```

> ### Silence is a contract term
>
> `rationale` and `skillScore` exist for our debug panel. **They must never be
> rendered in the game**, and no response here ever tells a player their
> difficulty moved. There is no toast, no badge, no "level up".
>
> If a UI surfaces either field, that is a contract violation, not a design
> choice. A test asserts `rationale` never contains player-facing wording.

Difficulty moves **one rung at a time, with hysteresis** — nobody jumps from
Pyramid to Dragon, and a player hovering near a boundary keeps the same shape.

---

## 8. `POST /api/receipts/validate`

**Request** `{ "signedTransaction": "<StoreKit 2 JWS>", "accountId": "<optional>" }`

**Response**

```jsonc
{
  "unlocked": true,
  "productId": "com.nihi.mahjong.lifetime",
  "originalTransactionId": "2000000000000001",
  "purchasedAt": "2026-08-09T22:00:00.000Z",
  "environment": "sandbox",
  "revoked": false
}
```

> ### No API reports a payment from a click or a handoff
>
> Only a cryptographically verified StoreKit transaction — or an App Store
> server notification, which is the same signature by another route —
> establishes a purchase.
>
> - `unlocked: true` is returned **only** after verification resolves.
> - **A missing key fails closed.** An unconfigured verifier returns
>   `not_configured`, never an unlock. An unlock handed out by a misconfigured
>   server costs revenue and cannot be taken back gracefully.
> - `revoked` matters as much as `purchased`. Refunds and family-sharing
>   removal both arrive as revocations; a verified-but-revoked transaction
>   returns `unlocked: false` with a `fallback_reason` saying why.
>
> All four of those are asserted in `contracts.test.ts`, including one that
> greps the entire unconfigured response for `"unlocked":true`.

A failed signature returns `configured` + `unverified_transaction` with a
player-safe message ("That purchase could not be verified. Try Restore
Purchases."). The verifier's internals go in `fallback_reason`, never in
`message` — the endpoint is an oracle otherwise.

### What the verifier actually does

A StoreKit 2 signed transaction is a JWS carrying its own certificate chain in
the `x5c` header. **Verifying the signature alone proves nothing** — the
certificate that signed it also came from the caller, so anyone can generate a
key, self-issue a certificate, sign a transaction saying whatever they like, and
watch it verify perfectly.

So the order is: parse → walk the `x5c` chain, checking each link actually signs
the next → confirm the chain terminates at **our pinned Apple Root CA G3** →
verify the leaf signature → and only then read the payload. Then check the
payload is for our `bundleId` and our `productId`, because a genuine verified
transaction for somebody else's app is still not our unlock.

There is a test for each of those as an attack: an attacker-rooted chain, a chain
with a forged link, a tampered payload, another app's product, another app's
bundle, and a future-dated purchase.

### Configuring it

| Variable | Where it comes from |
|---|---|
| `APPLE_ROOT_CA_G3_BASE64` | [apple.com/certificateauthority](https://www.apple.com/certificateauthority/), base64 of `AppleRootCA-G3.cer` |
| `IAP_PRODUCT_ID` | `com.nihi.mahjong.lifetime` |
| `APPLE_BUNDLE_ID` | blocked on D-001 |

**Pin the root; never fetch it at runtime.** A root you download at boot is a
root an attacker who controls the network can replace. A malformed pin fails at
construction, so a bad deployment breaks at boot rather than on the first
customer's purchase.

---

## 9. `GET /api/unlock-status`

`Authorization: Bearer <sessionToken>` (optional).

```jsonc
{
  "unlocked": false,
  "source": "none",        // verified_transaction | app_store_notification | none
  "productId": null,
  "verifiedAt": null
}
```

**There is no `client_claim` variant of `source`, on purpose.** A client cannot
assert a purchase into existence.

When Supabase is not configured, or the player is not signed in, this answers
`unlocked: false` with:

```
"fallback_reason": "Server-side unlock lookup not configured (…). The device's StoreKit entitlement remains authoritative."
```

That is the important bit for Codex: **this endpoint is not the gate today.**
The device's own StoreKit entitlement is, and it stays authoritative for a
signed-out player forever. This contract exists so a purchase follows a player
to their iPad, not so the paywall can phone home.

---

## 10. `POST /api/analytics/session`

Opt-in, local-first, no third parties. There is no vendor SDK in this app and
there is not going to be one — the App Store privacy label says "no data
collected" and keeping that true is worth more than any funnel chart.

**Request**

```jsonc
{
  "consent": true,                       // absent or false → discarded unread
  "boardsStarted": 5,
  "boardsCompleted": 3,
  "hintsUsed": 2,
  "totalSeconds": 900,
  "appVersion": "0.1.0",
  "anonymousSessionId": "rotating-device-local-id"
}
```

**Response** `{ "stored": false, "reason": "No consent on this request; the body was discarded." }`

The consent check runs **before anything is read from the body**, and a request
without consent is discarded rather than queued, sampled, or "anonymised". Off
means off.

Storage uses an **allow-list, not a deny-list**: a field added to the request
type later cannot start flowing to storage without someone adding it to
`ALLOWED_FIELDS` on purpose. A test sends an `appleUserId` and asserts it never
reaches the row.

Never stored here: an Apple id, an IDFA, an IP address, a device name, or
anything that survives a reinstall.

---

## Data that gets stored

`supabase/migrations/0001_init.sql`. Four tables, deliberately no more.

| Table | Holds | Notably does not hold |
|---|---|---|
| `accounts` | Apple's opaque `sub`, a uuid, a timestamp | email, name, anything reversible to a person |
| `settings` | the settings blob, a revision | anything about play |
| `unlocks` | one verified purchase per account | payment details |
| `session_analytics` | counts and durations | **no `account_id` column** |

Three choices worth knowing about:

- **`unlocks.original_transaction_id` is UNIQUE.** One purchase cannot unlock two
  accounts. That is receipt sharing, and the constraint belongs in the database
  rather than in application code that someone might refactor around.
- **`session_analytics` has no account column, on purpose.** Adding one later
  would silently turn an anonymous count into a behavioural profile, so the
  column does not exist to be added by accident.
- **RLS is on with no permissive policies.** The API uses the service-role key
  and enforces ownership itself, by only ever querying an `accountId` that came
  out of a verified session token. Deny-by-default is the backstop for anything
  that ever reaches these tables with an anon key.

Migrations are **append-only**. Never edit a file that has run anywhere.

---

## Notes for Codex

- **Build the play loop against 1, 2, 5, 6, 7 today.** They are pure and need no
  credentials.
- **3, 4, 9 and 10 also work today** — start the API with `NIHI_DEV_STORE=memory`
  and you have real sign-in, real settings sync and real unlock lookup against an
  in-process store. Nothing about the request or response shape changes when
  Supabase lands.
- **8 is the only one still dark**, and it fails closed. Do not build a UI path
  that treats a `not_configured` receipt response as a purchase.
- **Render `fallback_reason` nowhere.** It is diagnostic. The player-safe string
  is always `error.message`.
- **Do not gate the paywall on contract 9.** The device entitlement is
  authoritative; contract 9 is cross-device convenience.
- **`@nihi/core` is the supported import path** for the shared engine —
  `import { deal, availableMoves } from '@nihi/core'`. Deep relative paths into
  `packages/core/src/**` work but are not the contract; prefer the alias when you
  move rendering into `apps/mobile/`.
- If you need a shape that is not here, open a contract PR rather than reaching
  around it. That is the whole point of the seam.
