/**
 * The tile set.
 *
 * Traditional mahjong suits and honours — bams / craks / dots, four winds,
 * three dragons, flowers and seasons. The *semantics* are centuries-old public
 * domain; the *artwork* in `src/render/tileArt.ts` is drawn from scratch.
 * Nothing here or there is traced from, sampled from, or derived from any
 * commercial mahjong title's assets.
 */

export type Suit =
  | 'bamboo' // bams
  | 'character' // craks
  | 'circle' // dots
  | 'wind'
  | 'dragon'
  | 'flower'
  | 'season';

/** A tile's printed face. */
export interface TileFace {
  readonly suit: Suit;
  /** 1-9 for the three numbered suits; 1-4 winds; 1-3 dragons; 1-4 bonus. */
  readonly rank: number;
}

/**
 * Two tiles may be paired when their match groups are equal.
 *
 * Numbered suits, winds and dragons pair on the exact face. Flowers pair with
 * any other flower and seasons with any other season — the traditional rule,
 * and the one part of matching that surprises new players, so the hint coach
 * calls it out explicitly.
 */
export function matchGroup(face: TileFace): string {
  if (face.suit === 'flower' || face.suit === 'season') return face.suit;
  return `${face.suit}-${face.rank}`;
}

export function facesMatch(a: TileFace, b: TileFace): boolean {
  return matchGroup(a) === matchGroup(b);
}

export const WIND_NAMES = ['East', 'South', 'West', 'North'] as const;
export const DRAGON_NAMES = ['Red', 'Green', 'White'] as const;
export const FLOWER_NAMES = ['Plum', 'Orchid', 'Chrysanthemum', 'Bamboo'] as const;
export const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'] as const;

/** Human-readable face name — used by the hint coach and by screen readers. */
export function faceName(face: TileFace): string {
  switch (face.suit) {
    case 'bamboo':
      return `${face.rank} of Bamboo`;
    case 'character':
      return `${face.rank} of Characters`;
    case 'circle':
      return `${face.rank} of Circles`;
    case 'wind':
      return `${WIND_NAMES[face.rank - 1]} Wind`;
    case 'dragon':
      return `${DRAGON_NAMES[face.rank - 1]} Dragon`;
    case 'flower':
      return `${FLOWER_NAMES[face.rank - 1]} (Flower)`;
    case 'season':
      return `${SEASON_NAMES[face.rank - 1]} (Season)`;
  }
}

/**
 * The standard 144-tile set: 3 suits x 9 ranks x 4, 4 winds x 4, 3 dragons x 4,
 * 4 flowers, 4 seasons.
 */
export function standardSet(): TileFace[] {
  const faces: TileFace[] = [];
  const push = (suit: Suit, rank: number, copies: number) => {
    for (let i = 0; i < copies; i++) faces.push({ suit, rank });
  };

  for (const suit of ['bamboo', 'character', 'circle'] as const) {
    for (let rank = 1; rank <= 9; rank++) push(suit, rank, 4);
  }
  for (let rank = 1; rank <= 4; rank++) push('wind', rank, 4);
  for (let rank = 1; rank <= 3; rank++) push('dragon', rank, 4);
  for (let rank = 1; rank <= 4; rank++) push('flower', rank, 1);
  for (let rank = 1; rank <= 4; rank++) push('season', rank, 1);

  return faces;
}

/**
 * Faces for a layout of `count` positions, as `count / 2` matched pairs.
 *
 * Layouts are not obliged to hold exactly 144 tiles, so the standard set is
 * cycled as needed. Bonus tiles are dropped when cycling because a partial
 * flower group can leave an unmatchable odd tile out.
 */
export function facesForCount(count: number): TileFace[] {
  if (count % 2 !== 0) {
    throw new Error(`facesForCount: layout has an odd tile count (${count})`);
  }

  const standard = standardSet();
  if (count === standard.length) return standard;

  // Pair-wise cycle through the non-bonus faces so every face has a partner.
  const pairable = standard.filter((f) => f.suit !== 'flower' && f.suit !== 'season');
  const faces: TileFace[] = [];
  for (let i = 0; faces.length < count; i++) {
    const face = pairable[(i * 2) % pairable.length];
    faces.push(face, face);
  }
  return faces.slice(0, count);
}
