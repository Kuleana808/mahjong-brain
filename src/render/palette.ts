/**
 * The calm palette.
 *
 * Locked to the approved Mahjong Brain reference boards: emerald felt, warm
 * ivory bone, amber interaction, and restrained bronze. Every text/background pair below clears WCAG 2.1
 * AA (4.5:1 for body, 3:1 for large text and UI boundaries); the high-contrast
 * theme clears AAA.
 *
 * Suit hues are drawn from the Okabe–Ito colourblind-safe set, muted. Colour is
 * never the only signal — every tile also carries a distinct badge *shape* and,
 * on the numbered suits, an Arabic numeral. See `tileArt.ts`.
 */

export interface Palette {
  readonly name: ThemeName;
  readonly felt: string;
  readonly feltEdge: string;
  readonly tileFace: string;
  readonly tileFaceTop: string;
  readonly tileSide: string;
  readonly tileEdge: string;
  readonly tileShadow: string;
  readonly ink: string;
  readonly inkSoft: string;
  readonly selected: string;
  readonly hinted: string;
  /**
   * Opacity for tiles that cannot be picked up. Per-theme, because the same
   * 0.55 that reads as "greyed out" on paper reads as "gone" on near-black.
   */
  readonly dimAlpha: number;
  readonly suits: Readonly<Record<SuitKey, string>>;
}

export type ThemeName = 'calm' | 'calm-dark' | 'high-contrast';

export type SuitKey =
  | 'bamboo'
  | 'character'
  | 'circle'
  | 'wind'
  | 'dragonRed'
  | 'dragonGreen'
  | 'dragonWhite'
  | 'flower'
  | 'season';

export const PALETTES: Readonly<Record<ThemeName, Palette>> = {
  calm: {
    name: 'calm',
    felt: '#00483C',
    feltEdge: '#003B32',
    tileFace: '#F5ECD5',
    tileFaceTop: '#FFF9E9',
    tileSide: '#236B4B',
    tileEdge: '#0F513A',
    tileShadow: 'rgba(0, 20, 15, 0.58)',
    ink: '#143E34',
    inkSoft: '#526158',
    selected: '#E07A0B',
    hinted: '#607B25',
    dimAlpha: 0.72,
    suits: {
      bamboo: '#2F6B4F',
      character: '#2C4F73',
      circle: '#9C5124',
      wind: '#4A5259',
      dragonRed: '#93361F',
      dragonGreen: '#2F6B4F',
      dragonWhite: '#5C6670',
      flower: '#7A4A6B',
      season: '#7A6320',
    },
  },
  'calm-dark': {
    name: 'calm-dark',
    felt: '#191B1E',
    feltEdge: '#131518',
    tileFace: '#2A2D31',
    tileFaceTop: '#32363B',
    tileSide: '#1E2124',
    tileEdge: '#43484E',
    tileShadow: 'rgba(0, 0, 0, 0.45)',
    ink: '#E8E4DC',
    inkSoft: '#A7A199',
    selected: '#6FC0B8',
    hinted: '#D9AC5B',
    dimAlpha: 0.76,
    suits: {
      bamboo: '#77C79A',
      character: '#86B4E0',
      circle: '#E0975F',
      wind: '#AAB4BD',
      dragonRed: '#E58A72',
      dragonGreen: '#77C79A',
      dragonWhite: '#C3CBD4',
      flower: '#D19BC4',
      season: '#D8C071',
    },
  },
  'high-contrast': {
    name: 'high-contrast',
    felt: '#FFFFFF',
    feltEdge: '#E8E8E8',
    tileFace: '#FFFFFF',
    tileFaceTop: '#FFFFFF',
    tileSide: '#C4C4C4',
    tileEdge: '#000000',
    tileShadow: 'rgba(0, 0, 0, 0.35)',
    ink: '#000000',
    inkSoft: '#2B2B2B',
    selected: '#00504A',
    hinted: '#6A4200',
    dimAlpha: 0.62,
    suits: {
      bamboo: '#00502E',
      character: '#00305C',
      circle: '#7A2E00',
      wind: '#232A30',
      dragonRed: '#7A0F00',
      dragonGreen: '#00502E',
      dragonWhite: '#1E2A33',
      flower: '#5A0F4C',
      season: '#4A3A00',
    },
  },
};

export function suitKey(suit: string, rank: number): SuitKey {
  if (suit === 'dragon') return (['dragonRed', 'dragonGreen', 'dragonWhite'] as const)[rank - 1];
  return suit as SuitKey;
}
