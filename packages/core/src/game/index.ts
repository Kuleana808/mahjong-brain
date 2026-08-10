/**
 * The game engine's public surface.
 *
 * Pure: no DOM, no React, no native, no I/O. Everything here runs identically
 * in the app, in the API process, and in a test.
 */

export {
  availableMoves,
  canPair,
  freeTiles,
  isComplete,
  isCovered,
  isFree,
  isStuck,
  openSides,
  remainingTiles,
  removePair,
  tilesFreedBy,
  undoLast,
  type BoardState,
  type Tile,
} from './board';

export { canReshuffle, deal, reshuffle } from './deal';

export {
  chooseLayout,
  INITIAL_PROFILE,
  recordOutcome,
  skillScore,
  type BoardOutcome,
  type SkillProfile,
} from './difficulty';

export {
  LAYOUT_IDS,
  LAYOUTS,
  LAYOUTS_BY_DIFFICULTY,
  type Cell,
  type Layout,
  type LayoutId,
} from './layouts';

export { createRng, randomSeed, type Rng } from './rng';

export {
  DRAGON_NAMES,
  FLOWER_NAMES,
  SEASON_NAMES,
  WIND_NAMES,
  faceName,
  facesForCount,
  facesMatch,
  matchGroup,
  standardSet,
  type Suit,
  type TileFace,
} from './tiles';
