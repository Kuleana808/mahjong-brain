# Visual QA reference

Flow names and release priority live in `design/FLOWS.md`. Every QA state below maps to a named flow; no screen may exist as an unnamed one-off.

QA uses this matrix with `DESIGN.md` and `design/design-lock.json`. Capture each ID at 393×852 and 1024×1366 unless the row says otherwise. A state passes only when its structure, component states, tokens, copy hierarchy, safe areas, and interaction target sizes match the contract.

## Approved gameplay composition

The canonical gameplay reference is the four-panel board approved on 2026-08-10: normal play, blocked-tile feedback, three-slot holder warning, and full-holder revive. It fixes the following composition for every gameplay state:

- large overlapping portrait tiles dominate the middle of the screen; the board is a layered silhouette, never a uniform grid;
- tile faces are warm ivory fired ceramic with a satin glaze, a quiet top-left highlight, deep jade sides, and short contact shadows;
- face art uses one bold central hierarchy with no tiny corner badges; numbered suits retain large Arabic numerals, while winds and dragons use traditional glyphs with full English VoiceOver names;
- highlights describe the tile's curved edge but never form mirror glare, hard white streaks, or a plastic/glass shine;
- Back, remaining count, and Settings occupy one fixed top row; the four-slot holder sits immediately below it;
- Shuffle, Hint, and Undo form one fixed three-button bottom dock; gameplay feedback floats over the board without moving any chrome;
- the full-holder state dims the board and presents one ivory sheet with Revive primary and Restart secondary.

This written contract is the durable QA baseline. Competitor screenshots may explain scale or mechanics but are not visual assets and must not be copied into the product.

## Global checks for every capture

- Background is emerald, not blue-green, gray, or black.
- One primary amber action maximum.
- All paper/tile surfaces are warm ivory, never pure white.
- Display titles use the locked serif; body and controls use the rounded system stack.
- All controls are at least 48×48 points; primary actions at least 64 points high.
- Focus, Dynamic Type, Reduced Motion, VoiceOver names, safe areas, and 4.5:1 body contrast pass.
- No turtle, cartoon mascot, borrowed art, or unapproved color.
- Phone gameplay tiles measure at least 66 points wide; iPad tiles at least 80 points where layout permits. A visible botanical-green rim separates overlapping ivory faces. Faces use a restrained top-left ceramic sheen; they must read as fired bone, never glossy plastic. Blocked tiles remain readable at 72% opacity.
- The starter board uses the original Garden Steps silhouette: tapered outer rows and three visible elevations. It must not read as a uniform rectangular grid, and controls never move to make room for it.
- Gameplay chrome uses the same spatial anchors on phone and iPad: Back top-left, remaining count top-center, Settings top-right, four-slot holder centered below, and Shuffle/Hint/Undo centered at the bottom. Tablet size may scale spacing and tiles but must never create a right-hand control rail.
- The launch build is portrait-only on iPhone and iPad; rotation must not expose an unapproved landscape layout or move the gameplay controls.

## Canonical screen states

| QA ID | State | Required evidence |
|---|---|---|
| `S00-boot` | Native launch/boot | Emerald from first frame, centered brand mark, no white flash. |
| `S01-terms-rest` | Terms | Brand tile, welcome title, legal copy, one Accept CTA, working policy links. |
| `S01-terms-focus` | Terms focused | Visible ivory focus ring and unchanged layout. |
| `S02-age-rest` | Age gate | Three ivory range choices, close behavior only if contract permits, no preselection. |
| `S02-age-blocked` | Failed age gate | Calm blocked explanation, no dishonest retry loop, safe exit. |
| `S03-loading` | First-run loading | Brand tile, quote, truthful progress treatment, no fake percentage. |
| `S03-loading-offline` | Loading without API | Local play remains available; sync limitation stated only if relevant. |
| `S04-tutorial-match` | Match tutorial | Real holder and matching tiles; Continue and quiet Skip. |
| `S05-tutorial-edge` | Edge tutorial | Free and blocked tiles visually and verbally distinct. |
| `S06-tutorial-holder` | Holder tutorial | Four slots, three-slot warning, consequence explained without alarmism. |
| `S07-home-new` | New home | Brand hierarchy, Level 1 primary CTA, Settings medallion only; unavailable P1/P2 actions stay hidden. |
| `S07-home-progress` | Returning home | Accurate level progress and reward availability, no extra primary action. |
| `S07-home-offline` | Returning offline | Play remains primary; sync state is secondary and truthful. |
| `S08-game-empty` | Gameplay, empty holder | Board dominant, four empty slots, Hint/Undo/Settings; Undo disabled. |
| `S08-game-one` | Gameplay, one held | One real tile in holder, board count down one, Undo enabled. |
| `S08-game-two` | Gameplay, two unmatched | Stable holder order, neutral frame. |
| `S08-game-three` | Gameplay warning | Amber holder treatment and spoken “three of four” warning. |
| `S08-game-match` | Match clearing | Pair clears in 180 ms or opacity-only under Reduced Motion. |
| `S08-game-hint` | Hint shown | Leaf-green ring plus non-reflowing text overlay; board and tools keep their exact positions; safe move only. |
| `S08-game-blocked` | Blocked tile attempt | No holder change; concise spoken feedback; no punitive shake. |
| `S08-game-shuffle` | Shuffle | Board state updates; holder behavior follows contract; count and controls remain stable. |
| `S08-game-resume` | Cold resume | Seed, remaining tiles, holder occupancy, and controls exactly restored. |
| `S09-holder-full` | Four unmatched/full | Ivory warning/result panel, red semantic accent, Restart/Revive rules explicit. |
| `S09-revive-pending` | Reward/purchase pending | Dimensions stable, progress visible, duplicate action disabled. |
| `S09-revive-failed` | Revive unavailable | Factual failure, retry or home action, no grant without verification. |
| `S10-complete` | Board complete | Success hierarchy, board count/level progress accurate, Continue primary. |
| `S11-paywall` | Unlock offer | Product benefit, StoreKit price, Buy, Restore, close; no fake price. |
| `S11-purchase-pending` | Purchase pending | Buy disabled, stable card, progress and cancellation-safe copy. |
| `S11-purchase-success` | Purchase verified | Success state only after StoreKit/server proof; unlocked UI follows. |
| `S11-purchase-cancel` | Purchase cancelled | Quiet return, no error styling, no unlock. |
| `S11-purchase-error` | Purchase failed | Error message and retry/restore; no unlock. |
| `S11-restore-empty` | Nothing to restore | Exact honest message and safe close. |
| `S11-restore-success` | Restore verified | Owned state and cross-device unlock reflected. |
| `S12-settings` | Settings default | Appearance, text size, motion, blocked-tile dimming, haptics; one Done action. |
| `S12-settings-large` | 200% text | No clipped values; sheet scrolls; controls remain paired with labels. |
| `S12-settings-offline` | Settings sync unavailable | Local settings persist; sync limitation is secondary. |
| `S13-signin` | Apple sign-in | Native Apple control treatment; why/optional nature clear; free play not blocked. |
| `S13-signin-pending` | Apple sign-in pending | Duplicate taps disabled; native cancellation remains possible. |
| `S13-signin-error` | Invalid/expired token | No account/unlock granted; retry and local play remain available. |
| `S14-levels` | Levels | Current level dominant, completed/current/locked distinguishable without color. |
| `S15-daily-claimable` | Daily reward | Seven-day strip, Today marked, one Collect CTA. |
| `S15-daily-claimed` | Daily claimed | Reward acknowledged, Collect removed/disabled, next day clear. |
| `S15-daily-offline` | Daily unavailable | No fabricated reward; retry later message. |
| `S16-generic-offline` | Offline panel | Calm info styling and functional local-play action. |
| `S17-generic-error` | Recoverable error | What happened, what remains safe, one retry and one exit. |
| `S18-maintenance` | Service unavailable | Local gameplay path remains if technically possible; no endless spinner. |

## Component-state captures

Maintain one Storybook-like internal specimen route or deterministic test harness showing every state named under `components` in `design/design-lock.json`. QA must be able to compare states without playing until each happens.

| Component | Locked state names |
|---|---|
| Primary button | `rest`, `pressed`, `focused`, `disabled`, `loading` |
| Secondary button | `rest`, `pressed`, `focused`, `disabled` |
| Icon button | `rest`, `pressed`, `focused`, `disabled`, `selected` |
| Tile | `free`, `blocked`, `pressed`, `hinted`, `matched`, `removing` |
| Holder | `empty`, `one`, `two`, `warning-three`, `full-four`, `matching`, `clearing` |
| Panel | `standard`, `dialog`, `warning`, `success`, `offline`, `error` |
| Switch | `off`, `on`, `focused`, `disabled` |
| Segmented control | `rest`, `selected`, `focused`, `disabled` |
| Progress | `empty`, `partial`, `complete`, `indeterminate` |
| Toast/banner | `info`, `success`, `warning`, `error` |
| Gameplay chrome | `top-back`, `top-count`, `top-settings`, `bottom-shuffle`, `bottom-hint`, `bottom-undo`, `jade-card-controls` |

## Asset checks

Each item in `design/ASSETS.md` must have an approved output or an explicit non-release status. TestFlight preflight fails if app icon, splash, tile back, required icons, or App Store screenshots are still specified/draft.

## Drift decision rule

- Expected token/state changed and approved: update `DESIGN.md`, `design/design-lock.json`, this matrix, and the baseline in one PR.
- Screenshot changed with no approved contract change: fail QA.
- Contract changed with no screenshot/state coverage: fail QA.
- Difference caused only by platform font rasterization under tolerance: record it, do not silently replace the baseline.
