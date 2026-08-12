# Integration test — 2026-08-11

End-to-end run of Codex's `codex/build-mobile-shell` against the real backend.
Recorded because "it works" is not a result; what was actually exercised is.

## What ran

Codex's branch checked out in a **separate worktree** (`~/mahjong-brain-claude`)
so their working tree was never touched, the contracts API running with the dev
store, and the app pointed at it via `VITE_API_BASE_URL=http://localhost:5185`.

Then the whole flow was driven through the real UI — not the state machine
directly, and not a mock:

```
TOS → age band → tutorial A → tutorial B → tutorial C → home → gameplay
```

followed by 14 real matched pairs (144 → 116 tiles) and a hint request.

## Result: the funnel is real

**95 events** arrived UI → HTTP → API → store, across 8 `POST /api/events/batch`
calls, all `200 configured`:

| count | event |
|---:|---|
| 28 | `tile_tap` |
| 14 | `holder_slot_filled` |
| 14 | `pair_cleared` |
| 6 | `tutorial_step_shown` |
| 6 | `tutorial_step_completed` |
| 5 | `app_open` |
| 5 | `session_start` |
| 3 | `session_end` |
| 2 | `tos_accepted`, `age_gate_shown`, `age_gate_passed`, `loading_quote_shown`, `tutorial_completed`, `board_start` |
| 1 | `hint_tapped`, `hint_shown` |

A stored row:

```json
{
  "schema_version": 1,
  "anonymous_device_id": "device_71dd6cf9-…",
  "session_id": "session_55c1a1e7-…",
  "app_version": "0.1.0",
  "platform": "web",
  "name": "app_open",
  "client_at": "2026-08-12T03:28:28.631Z",
  "server_at": "2026-08-12T03:35:51.501Z",
  "sequence": 0,
  "properties": {}
}
```

**No `account_id`, no identifier of any kind.** The privacy property from D-016
holds in the running system, not just in the handler.

`GET /api/game/board/generate → 200 live_verified` also came from the real app.

## What this promotes, and what it does not

| Contract | Before | After | Why |
|---|---|---|---|
| 1 `board/generate` | `live_verified` | `live_verified` | now also exercised by the shipping app |
| 11 `events/batch` | `configured` | **still `configured`** | see below |
| 3, 4, 9, 10, 12 | `configured` | `configured` | not exercised by this run |
| 8 `receipts/validate` | `source_available` | `source_available` | fails closed, D-005 |

**Contract 11 is not promoted, deliberately.** It was exercised end to end
through the real client, which is most of the risk — but against the in-process
dev store, not Postgres. `live_verified` means observed against the real thing,
and the store is the part that was not real. The remaining untested surface is
the PostgREST insert, the column names and the RLS posture.

That is one `npm run smoke:supabase` away, and it is blocked on infrastructure,
not on code.

## Regressions found: none in the engine

- **259 tests pass** on Codex's branch, including every engine invariant
  (solvability by construction, holder capacity, revive restoring positions, the
  flow machine's gates).
- `tsc` clean, web build clean.
- The accessibility layer survived the visual rework — tiles still expose
  `"6 of Bamboo, free on the left"` / `"3 of Characters, blocked"`.
- Tutorial `Continue` is correctly **disabled** until the pair is actually
  matched. Looked like a stuck button on first pass; it is right.

## Open observations for Codex

1. **Issue #3 (rAF in a hidden tab) is still live.** On this branch the board
   canvas stays `300×150` and unpainted until the tab is foregrounded. The DOM
   tile layer is fine throughout, so the board stays keyboard- and
   screen-reader-usable — it is only the canvas. Harmless on device, visible on
   web.

2. **Blocked-tile contrast on the new green felt.** With `dimBlocked` on, dimmed
   tiles read as pale-green-on-green and most of the board's interior is hard to
   parse. I tried to measure it and my sample hit the unpainted canvas, so
   **this is an observation from the screenshot, not a measured ratio** — worth
   a real check against the 60+/WCAG bar before release, since "tiles big enough
   to actually read" is the product promise.

3. **The age screen is a band selector, not a gate.** All three options
   (`0–35`, `35–55`, `55+`) proceed. That is fine as audience segmentation and
   is probably parity — but it is then *not* an age gate, and the under-13
   question in D-016 is still open. It matters the moment an ad SDK lands:
   personalised ads are not permitted for under-13s, and `0–35` includes them.

## Infrastructure blocker — local Supabase

Not code. The OrbStack VM is 28 GiB and was 100% full.

I reclaimed **3.3 GiB** by removing ten Supabase images that no container
referenced — leftovers from an earlier aborted pull plus superseded versions. I
deliberately did **not** run `prune -a`: the `people-by-place` (canvass.to)
stack was live in that VM and would have lost its images.

The stack then began pulling and **OrbStack itself crashed and will not
restart** (`orb status` → `Stopped`, docker socket gone). That also stopped
canvass.to's local Supabase as a side effect — it should return when OrbStack
comes back.

I stopped there rather than attempting a VM repair, because that VM holds
another project's database.

**To unblock, either:**

- restart/repair OrbStack and grow its disk (Settings → Resources), then
  `npx supabase start && npm run smoke:supabase`; or
- **preferred and durable:** a hosted free-tier Supabase project. That needs a
  Supabase login, which is not available here — and creating an account in
  Brent's name is not something to do on his behalf. With the URL and
  service-role key it is two environment variables and the smoke test runs
  immediately.

Local stack config is already committed and port-remapped to **544xx** so it
cannot collide with canvass.to on 5432x.
