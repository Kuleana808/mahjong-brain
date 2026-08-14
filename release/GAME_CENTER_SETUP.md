# Game Center production setup

The binary contains an optional Game Center bridge. Gameplay never requires
authentication and failed submissions never block a board.

Enable Game Center for app `6800468742` and create these exact identifiers in
App Store Connect before submitting a build that exposes the feature.

## Leaderboards

| Identifier | Name | Sort | Score format |
|---|---|---|---|
| `com.nihi.mahjong.boardsCleared` | Boards Cleared | High to low | Integer |
| `com.nihi.mahjong.brainIq` | Brain IQ | High to low | Integer |

## Achievements

| Identifier | Name | Points | Trigger |
|---|---|---:|---|
| `com.nihi.mahjong.firstClear` | First Clear | 5 | Clear one board |
| `com.nihi.mahjong.tenBoards` | Finding Focus | 10 | Clear ten boards |
| `com.nihi.mahjong.fiftyBoards` | Tile Scholar | 25 | Clear fifty boards |
| `com.nihi.mahjong.noHintClear` | Clear Mind | 10 | Clear without a hint |
| `com.nihi.mahjong.cleanClear` | In the Flow | 20 | Clear without hint or shuffle |

Add localized title, description, pre-earned artwork, and earned artwork for
every achievement. Verify authentication, score backfill, completion banners,
dashboard dismissal, offline play, and later retry on a physical sandbox device.
