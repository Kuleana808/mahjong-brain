# Mahjong Brain design system

This file is the visual source of truth for product, engineering, and QA. The approved reference is the two emerald mobile boards supplied by Brent on 2026-08-10. If an implementation, screenshot, or generated asset disagrees with this document, this document wins until Brent approves a change.

Machine-readable values live in `design/design-lock.json`. The command `npm run check:design-drift` verifies the implementation has not silently changed them.

Named product flows, release tiers, and completion proofs live in `design/FLOWS.md`. Visual QA state IDs live in `design/QA_REFERENCE.md`; asset requirements live in `design/ASSETS.md`.

## Product and audience

Mahjong Brain is a calm, readable tile-matching game for adults, including players 55 and older. It must feel polished and reassuring, never childish, clinical, casino-like, or frantic. There is no turtle or character mascot. The brain-and-leaf tile is the brand mark.

## Approved direction

- **Aesthetic:** refined botanical mahjong. Deep emerald rooms, warm bone tiles with a botanical-green body/rim, restrained bronze line work, one amber action color.
- **Decoration:** intentional. Fine borders, faint botanical/mahjong patterns, shallow dimensional tile shadows. No glitter, neon, purple gradients, cartoon creatures, or unrelated illustration.
- **Layout:** symmetric and grid-disciplined for onboarding and dialogs; board-led during gameplay; extra iPad room improves scale and breathing room rather than adding choices.
- **Color:** restrained. Amber is reserved for the primary action and active progress. Red is semantic danger or a traditional tile suit, never a generic CTA.
- **Motion:** functional and quiet. Tile pickup, match clear, panel entrance, and progress only. Reduced Motion removes transforms and uses opacity changes no longer than 100 ms.

## Color roles

| Role | Token | Value | QA rule |
|---|---|---:|---|
| App background | `backgroundApp` | `#003B32` | Every full-screen state begins here. No hue drift toward teal-blue or black. |
| Raised jade | `backgroundRaised` | `#00483C` | Panels on dark backgrounds and gameplay felt. |
| Deep jade | `jade-950` | `#003B32` | Edge shading and safe-area fill. |
| Tile/paper | `surfacePrimary` | `#F5ECD5` | Tiles, cards, choice buttons. Warm, never pure white. |
| Highlighted paper | `surfaceElevated` | `#FFF9E9` | Top-lit tile face and raised dialog areas. |
| Dark-surface text | `textOnDark` | `#FFF7E5` | Titles and controls on jade. |
| Paper text | `textOnLight` | `#143E34` | Primary card and tile text. |
| Muted paper text | `textMutedOnLight` | `#526158` | Supporting copy only. |
| Primary action | `actionPrimary` | `#C76508` | One main CTA per screen. |
| Interaction amber | `amber-500` | `#E07A0B` | Focused progress, holder warning, selected accents. |
| Bronze edge | `bronze-500` | `#B98A3E` | Panels, medallions, ornaments. Tile edges use botanical green. |
| Bronze shadow | `bronze-700` | `#745022` | Physical depth and separators. |
| Botanical accent | `leaf-500` | `#607B25` | Leaves and hint state. |
| Danger | `danger` | `#93361F` | Holder-full and destructive/error messaging. |
| Information | `info` | `#2C4F73` | Neutral informational state. |

Color never carries meaning alone. Holder warnings include occupancy text and border treatment; tile suits retain Arabic numerals and distinct badge shapes.

## Typography

- **Display:** Georgia, then Times New Roman. Used for product name, screen titles, large level and reward values. This preserves the refined editorial quality of the approved boards without adding a network font dependency.
- **Body/UI:** SF Pro Rounded on Apple platforms, then the system UI stack. Minimum 19 px at the default text setting.
- **Numbers:** tabular numerals for counts, level progress, price, and IQ.
- **Scale:** caption 13, body 19, button 20, title 32, display 52 px. Dynamic type may enlarge these. It must never shrink below the locked defaults.
- **Line length:** supporting text is limited to 32 characters on phone and 46 on iPad where practical.

## Spacing, shape, and elevation

- Base unit: 4 px. Allowed spacing: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Minimum interactive target: 48 by 48 px. Primary actions are at least 64 px high.
- Radius hierarchy: tile 8 px, control 12 px, panel 24 px, circular control 9999 px.
- Panels use a bronze double-line or keyline, not a generic floating white card.
- Shadows suggest physical tile depth. Tile faces have one restrained top-left ceramic glaze highlight; bevel, green body thickness, and contact shadow do most of the dimensional work. Blur-heavy glassmorphism is limited to the modal scrim and never used for core surfaces.

## Component contracts

### Buttons

- Primary: amber face, warm highlight, bronze lower edge, ivory label. Only one per screen.
- Secondary: ivory face, jade label, bronze edge.
- Quiet/text: ivory text on jade or jade text on paper; underlined only for legal links.
- Disabled: 42% opacity while retaining readable label text. Loading preserves dimensions and replaces, rather than adds to, the label.

### Mahjong tiles

- Warm ivory face, lighter top edge, bronze/tan side, dark jade or suit ink.
- Phone face width must be at least 66 px in the canonical 393 px viewport. iPad targets 80 px or larger.
- The exposed side and lower rim are deep botanical green (`#236B4B` side, `#0F513A` edge). This is the separation layer between overlapping ivory faces and must remain visible.
- States: free 100%; blocked 58%; pressed lifts 4 px; hinted gets leaf-green ring; matched uses a 180 ms opacity/lift clear; removing is never left interactive.
- Tile drawings are code-generated and original. No external tile sprite, traced incumbent art, or binary render-pipeline asset.

### Holder

- Exactly four slots. Empty slots are visible, not blank space.
- Occupancy 0–2 is neutral bronze. Three is warning amber and announced. Four is danger red and immediately enters the holder-full flow.
- A matching pair clears in place; other held tiles keep their order.

### Panels and dialogs

- Jade onboarding panel for terms and age. Ivory elevated panel for rewards, settings, errors, purchase, and results.
- Scrim is deep jade at 76% plus a restrained 8 px blur.
- Every dialog has one primary action, a visible close or safe secondary action, and a VoiceOver label.

### Progress and feedback

- Tracks use deep jade; fill is leaf green for normal progress and amber only for attention.
- Toast/banner states are info, success, warning, and error, each with icon, title, and readable text.
- Loading uses an indeterminate or measured progress treatment. It does not fake a percentage.

## Responsive rules

- Canonical phone QA viewport: 393 by 852 points.
- Small phone QA viewport: 375 by 667 points.
- Canonical iPad QA viewport: 1024 by 1366 points.
- Phone is portrait-only for the first TestFlight unless a tested landscape board is intentionally approved.
- iPad may use a side rail for holder/help, but the board remains the dominant region.
- Safe areas always use deep jade. No white launch flash or clipped bottom action.

## Motion

| Token | Duration | Usage |
|---|---:|---|
| instant | 0 ms | State replacement under Reduced Motion |
| micro | 100 ms | Press and focus feedback |
| short | 180 ms | Tile pickup/match clear |
| medium | 320 ms | Dialog and screen entrance |
| long | 600 ms | First-run loading progress only |

Use the locked enter, exit, and move easing curves in `design/design-lock.json`. No continuous ambient animation during gameplay.

## Asset language

All product assets derive from the same materials: deep emerald field, warm bone tile, engraved bronze line, olive botanical leaves, and the brain-and-leaf emblem. See `design/ASSETS.md` for required sizes, variants, provenance, and QA criteria.

## Drift policy

1. Run `npm run check:design-drift` in CI and before any visual QA.
2. QA captures every canonical state listed in `design/QA_REFERENCE.md` at phone and iPad sizes.
3. Token changes require an explicit `design/design-lock.json` diff and Brent approval.
4. New components must add their states to the lock and QA matrix before shipping.
5. Screenshot changes without a corresponding approved token/state change are regressions.

## Decisions

| Date | Decision | Reason |
|---|---|---|
| 2026-08-10 | Emerald, ivory, amber, bronze language locked | Matches the two approved reference boards and prevents the palette drift Brent identified. |
| 2026-08-10 | No mascot; brain-and-leaf tile is the mark | The turtle direction felt creepy and did not fit the calm adult audience. |
| 2026-08-10 | Presentation overlap enlarges phone tiles to at least 66 points | Preserves the shared 144-tile rules while matching the physical scale and clarity of the approved competitive reference. |
| 2026-08-10 | Tile body/rim changed to botanical green | Brent identified the green separation layer as the reason the competitive stack reads as physical, distinct tiles. |
| 2026-08-10 | Restrained ceramic glaze, not plastic gloss | A narrow directional highlight improves physical-tile recognition while keeping symbols crisp and the adult botanical tone intact. |
| 2026-08-10 | Garden Steps replaces the rectangular starter silhouette | Tapered rows and three elevations make the board read as a physical arrangement while retaining the 10 x 8 footprint needed for 66-point phone tiles. |
| 2026-08-10 | Gameplay controls keep identical anchors on phone and iPad | The approved mockups establish top-corner navigation, a centered holder, and a bottom utility dock; tablet space increases scale, not control relocation. |
| 2026-08-10 | Machine lock plus state matrix required | QA needs pass/fail evidence, not subjective recollection. |
