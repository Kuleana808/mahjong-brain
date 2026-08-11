# Asset specification and inventory

Every asset must be original, generated from the locked design language, and traceable in the PR that introduces it. `status` values are **specified**, **draft**, **approved**, or **shipped**. Nothing marked specified or draft may be treated as App Store-ready.

| ID | Asset | Required variants | Output | Status | QA acceptance |
|---|---|---|---|---|---|
| `brand-mark` | Brain-and-leaf engraved tile | full, compact, monochrome | SVG/code path | draft | Symmetric brain, botanical stem/leaves, no face/mascot, legible at 40 px. |
| `wordmark` | Mahjong Brain | stacked, single-line | vector/type lockup | draft | Georgia-family display shape, ivory with restrained bronze depth, no logo substitution. |
| `app-icon` | Brand tile in emerald frame | 1024 px master plus iOS rendition | SVG master + PNG asset catalog | approved | No transparency; no text; survives 29 px; emerald/ivory/bronze only. Source: `design/assets/app-icon-master.svg`. |
| `splash` | Centered wordmark and brand tile | iPhone/iPad, lightless emerald | SVG master + PNG asset catalog | approved | No white flash; no progress UI; safe at all aspect ratios. Source: `design/assets/splash-master.svg`. |
| `felt-background` | Emerald botanical field | phone portrait, iPad portrait/landscape | CSS/vector preferred | draft | Pattern under 18% opacity; does not reduce text contrast. |
| `panel-ornament` | Bronze corner/keyline motif | top, bottom, full-frame | CSS/SVG | draft | 1–2 px apparent weight; never competes with copy. |
| `botanical-sprig` | Olive leaves | left, right, compact | code SVG | specified | Same leaf geometry across home, splash, levels, reward. |
| `tile-faces` | Full mahjong set | all suits, winds, dragons, flowers, seasons | Canvas code | approved code | Bold central motif; Arabic numeral visible on numbered suits; suit shape distinct without color; traditional wind/dragon glyphs; no external art. |
| `tile-back` | Brain-and-leaf engraving | standard, compact | Canvas/SVG code | draft | Warm bone relief; same mark as app icon. |
| `holder-frame` | Four-slot tray | empty, warning, full | CSS/code | draft | Exactly four equal slots; occupancy remains visible at 200% text. |
| `icon-profile` | Profile medallion | normal, focused, disabled | original inline vector | draft | 24 px glyph in 48 px target; bronze ring. |
| `icon-daily` | Daily reward medallion | available, claimed, focused | original inline vector | draft | Sun cue, not casino currency. |
| `icon-settings` | Settings medallion | normal, focused | original inline vector | draft | Matches profile/reward stroke and optical size. |
| `icon-hint` | Hint | available, used, unavailable | original inline vector | draft | Lightbulb, never glowing neon. |
| `icon-undo` | Undo | available, disabled | original inline vector | draft | Counter-clockwise arrow, not shuffle. |
| `icon-shuffle` | Shuffle | available, disabled, purchase | original inline vector | draft | Crossing arrows and quantity badge where purchased. |
| `game-sounds` | Original interaction audio | tile, blocked, match, holder warning/full, hint, shuffle, undo, win | Web Audio synthesis | approved code | Quiet ceramic/wood character, no borrowed samples, no casino fanfare; Sound toggle silences every cue. |
| `icon-revive` | Revive | available, ad-required, unavailable | original vector | specified | Return/restore cue; no heart/life system. |
| `tutorial-match` | Matching diagram | rest, tapped, clearing | live components | draft | Uses actual tile and holder components, not a separate illustration style. |
| `tutorial-edge` | Free-edge diagram | free, left-right locked | live components | draft | Demonstrates blocking with opacity and arrows plus text. |
| `tutorial-holder` | Holder-risk diagram | 0, 3-warning, 4-full | live components | draft | Same holder as gameplay; exactly four slots. |
| `daily-reward` | Seven-day reward strip | claimable, today, claimed, missed | live components | specified | Today unambiguous without color; reward icon and quantity readable. |
| `purchase-badge` | Product quantity/status | owned, price, pending | live component | specified | StoreKit price string, never hard-coded for release. |
| `empty-offline` | Offline/error support mark | offline, retry, unavailable | icon + panel | specified | Calm and factual; no mascot or blame language. |
| `app-store-screens` | Store listing screenshots | required iPhone/iPad sizes | PNG/JPEG | specified | Generated only from a release candidate; no UI claims absent from build. |

## Asset provenance checklist

- Source owner and creation method recorded.
- No copied screenshots, sprite sheets, icons, or character art from Vita Mahjong or another game.
- Vector/code source committed with raster output where possible.
- Light/dark behavior and 200% text checked.
- App icon and screenshots verified at App Store-required sizes before upload.
