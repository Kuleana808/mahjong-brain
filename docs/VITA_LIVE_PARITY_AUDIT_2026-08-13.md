# Vita Mahjong live parity audit

Observed through iPhone Mirroring on 2026-08-13. This records the currently
installed iPhone build, not assumptions from store screenshots. No purchase was
started, no tracking permission was accepted, and no account data was entered.

## Live flow and state catalogue

### Home

- Seasonal flower frame and falling-petal motion surround a shoji-door scene.
- Profile, leaf currency, theme, and settings controls sit above the wordmark.
- One dominant orange `Level 1` action starts play.
- The home scene is expressive; gameplay removes most decoration so the board
  becomes the main action.

### Gameplay

- Back and menu controls occupy the upper corners.
- A centered progress score is followed by a narrow, four-slot green holder.
- Holder slots use only subtle vertical separators.
- The irregular layered board fills most of the remaining screen width.
- Large white tiles use a thin green side/back layer, dark shadow, rounded
  corners, and high-contrast red, blue, and green faces.
- Bottom actions are Shuffle, Hint, and Undo. Hint and Undo show `Free`; Shuffle
  shows a locked level state in this observed board.
- Hint marks both matching tiles with a bright cyan treatment.

### Options

- Four icon toggles appear first: music, sound, voice, and haptics.
- Auto Complete has its own toggle.
- Rows open Theme, How to Play, No Ads, and Restart.
- Restart is a visually distinct green action.

### Theme

- Separate Tiles and Background tabs.
- Tile sets observed: Simple, Classic, and Vintage. Each row previews its colored
  tile back plus five representative faces.
- Five background choices are shown as large visual swatches.
- Selection is previewed before a large Confirm action.

### No Ads

- The observed offer says `Forever Super Offer` and `$5.99`, with Restore below.
- The same panel contains subscription auto-renewal boilerplate. That is an
  internally confusing purchase description and should not be copied.

### Advertising and cross-promotion

- Selecting Theme unexpectedly opened a full-screen ActBlue Field Tools
  cross-promotion before the theme screen appeared.
- This is exactly the kind of surprise interruption Mahjong Brain should avoid:
  ads belong at disclosed boundaries, never between a settings row and the
  requested settings surface.

## Functional parity matrix

| Capability | Vita live | Mahjong Brain source | Required action |
|---|---|---|---|
| One-action home | Yes | Implemented | Preserve hierarchy and brand originality. |
| Four-slot holder | Yes | Implemented | Keep tray narrow with subtle separators and tile-flight animation. |
| Large irregular board | Yes | Implemented | Device QA against approved tile-size reference. |
| Shuffle / Hint / Undo | Yes | Implemented as actions | Add truthful inventory/price state and provider-backed grants. |
| Hint pair highlight | Cyan pair | Implemented | Verify contrast, VoiceOver announcement, and Reduce Motion. |
| Options toggles | 5 observed | Settings exist | Verify parity for music, sound, voice, haptics, and Auto Complete. |
| Tile themes | 3+ sets | Theme switching exists | Finish fully original production-quality tile sets and previews. |
| Background themes | 5 observed | Theme switching exists | Finish swatch previews and persistence. |
| How to Play | Yes | Tutorial exists | Add an always-reachable replayable rules surface if absent. |
| Restart | Yes | Implemented | Confirm recovery copy and no accidental purchase path. |
| Remove ads + Restore | Yes | Partial StoreKit | Finish product configuration, sandbox purchase, restore, and precise copy. |
| Rewarded Hint | Advertised in product doctrine | Provider absent | Choose provider, privacy posture, signed callback, and device canary. |
| Rewarded Revive | Advertised in product doctrine | Provider absent | Same; never grant from a client-only callback. |
| Consumable Shuffle | Advertised in product doctrine | Catalogue only | Extend StoreKit bridge and server grant ledger. |
| Daily reward / streak | Competitor screenshots/reviews | API only | Build UI, signed-in recovery, idempotent claim, and missed-day state. |
| Seasonal home/live ops | Live | Not launch-complete | Define original, lightweight cadence after core loop is stable. |

## Improvements required by review feedback and this audit

1. Never interrupt an active board or a requested settings transition with an
   automatic ad.
2. State exactly whether a purchase is one-time or renewing; never combine
   `Forever` with subscription-renewal copy.
3. Optional rewarded ads stay visibly optional and never become necessary to
   finish a solvable seed.
4. Persist a pending verified reward across backgrounding, provider redirects,
   and network failure so a completed ad cannot lose its grant.
5. Keep Restore and purchase scope plainly visible.
6. Preserve the tile-first gameplay hierarchy while using wholly original art,
   brand, copy, and ornamental expression.

## Evidence boundary

Not observed in this pass: a completed purchase, Restore result, holder-full
Revive, daily reward, win progression, level-selection map, notification flow,
or failure/offline states. Those remain unverified rather than inferred.
