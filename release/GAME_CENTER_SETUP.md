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

| Identifier | Name | Points | Trigger | Pre-earned description | Earned description | Artwork |
|---|---|---:|---|---|---|---|
| `com.nihi.mahjong.firstClear` | First Clear | 5 | Clear one board | Clear your first board. | You cleared your first board. | `release/app-store/game-center/achievements/first-clear.png` |
| `com.nihi.mahjong.tenBoards` | Finding Focus | 10 | Clear ten boards | Clear ten boards. | Ten boards cleared. Your focus is growing. | `release/app-store/game-center/achievements/finding-focus.png` |
| `com.nihi.mahjong.fiftyBoards` | Tile Scholar | 25 | Clear fifty boards | Clear fifty boards. | Fifty boards cleared. You know the tiles. | `release/app-store/game-center/achievements/tile-scholar.png` |
| `com.nihi.mahjong.noHintClear` | Clear Mind | 10 | Clear without a hint | Clear a board without using Hint. | You cleared the board without a hint. | `release/app-store/game-center/achievements/clear-mind.png` |
| `com.nihi.mahjong.cleanClear` | In the Flow | 20 | Clear without hint or shuffle | Clear a board without Hint or Shuffle. | A clean clear with no Hint or Shuffle. | `release/app-store/game-center/achievements/in-the-flow.png` |

Each artwork file is an original 1024 x 1024 RGB PNG prepared for Apple’s
achievement localization requirement. Add the U.S. English display name,
pre-earned description, earned description, and artwork shown above for every
achievement. Verify authentication, score backfill, completion banners,
dashboard dismissal, offline play, and later retry on a physical sandbox device.
