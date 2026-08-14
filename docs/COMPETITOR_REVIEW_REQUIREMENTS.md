# Competitor review requirements

Last researched: 2026-08-13

Live installed-app observations are catalogued separately in
[VITA_LIVE_PARITY_AUDIT_2026-08-13.md](VITA_LIVE_PARITY_AUDIT_2026-08-13.md).

This is the launch-parity quality bar derived from recurring Vita Mahjong
reviews. It describes behavior to improve, not art or copy to reproduce.

## What players repeatedly like

- Large, readable tiles and a board that remains the primary action.
- A simple holder mechanic, undo, hint, shuffle, and multiple tile/background
  styles.
- Progression that gives players a reason to return.

## Recurring failure themes and our acceptance criteria

| Review theme | Mahjong Brain requirement |
|---|---|
| Long, repetitive, or hard-to-close ads break immersion | No ad during an active board. Interstitials may appear only at a round boundary, have a predictable close path, respect the remove-ads entitlement, and are frequency capped. |
| Rewarded ad completes but the reward is missing | The client never grants from a tap or local callback. A reward appears only after provider/server verification; pending, failed, and retry states remain explicit. |
| “No ads” still shows ads without explaining why | Store copy says exactly what is removed. Optional rewarded Hint/Revive ads are disclosed before purchase and remain opt-in. |
| Boards become unfair or require ads or power-ups to finish | Every shipped seed must remain solvable without a purchase or ad. Difficulty changes are bounded and tested; no forced power-up gate. |
| Daily leagues punish people with less time | Daily rewards never erase earned inventory or level progress. Missing a day restarts only the displayed streak; it does not remove prior rewards. |
| Controls and remove-ads purchase are hard to find | Settings uses the standard gear or menu placement from the approved mockups; Restore and remove-ads scope are plainly labeled. |
| Tiles are difficult to read | Preserve the approved large 3D ivory tiles, strong face contrast, non-touching dots, visible enabled or disabled treatment, and swappable tile/background styles. |
| Updates unexpectedly replace familiar play | Holder rules, inventory effects, and progression are documented and migration-tested; release notes name material changes. |

## Claims policy

Do not claim that Mahjong Brain improves IQ, prevents illness, reduces stress,
improves sleep, or guarantees relaxation. Do not promise no ads, no streaks,
every future layout, or that this is the only purchase while parity monetization
and retention exist. Describe only current, verified behavior and scope each
purchase precisely.

## Launch monetization contract

- Revive: explicit opt-in rewarded ad; verified grant; Restart always remains.
- Hint: explicit opt-in rewarded ad after the free allowance; verified grant.
- Shuffle: consumable StoreKit pack; never required to solve a valid board.
- Remove interruption ads: non-consumable StoreKit product; removes automatic
  round-boundary ads, not optional rewarded ads.
- Daily reward: server-authoritative, idempotent, and never destructive.

The app must keep all provider-dependent actions hidden or disabled with an
honest unavailable state until the provider, privacy disclosure, callback
verification, and sandbox canaries are live.

## Design-lock revision 5

The 2026-08-13 live-app review made the visibility gap concrete. The approved
calm palette now uses brighter ivory faces, a more saturated but narrower jade
extrusion, stronger contact shadows, and a lighter blocked-tile reduction. Hint
uses a synchronized jade-mint wash and two soft pulses before holding a crisp
outline. This is an intentional design-system revision, not unreviewed drift.
