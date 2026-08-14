/**
 * The calm palette.
 *
 * Locked to the approved Mahjong Brain reference boards: emerald felt, warm
 * ivory bone, amber interaction, and restrained bronze. Every text/background pair below clears WCAG 2.1
 * AA (4.5:1 for body, 3:1 for large text and UI boundaries); the high-contrast
 * theme clears AAA.
 *
 * Suit hues are drawn from the Okabe–Ito colourblind-safe set, muted. Colour is
 * never the only signal: every family has a distinct large central motif, and
 * character tiles use traditional Chinese numerals plus 萬. See `tileArt.ts`.
 */

export interface Palette {
  readonly name: ThemeName;
  readonly tileStyle: TileStyleName;
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

export type ThemeName = 'calm' | 'bamboo' | 'plum' | 'calm-dark' | 'high-contrast';
export type TileStyleName = 'ivory' | 'jade-edge' | 'porcelain' | 'brain';

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
    tileStyle: 'ivory',
    felt: '#002B26',
    feltEdge: '#001B18',
    tileFace: '#F6EEDB',
    tileFaceTop: '#FFFDF4',
    tileSide: '#15934D',
    tileEdge: '#064629',
    tileShadow: 'rgba(0, 10, 8, 0.78)',
    ink: '#143E34',
    inkSoft: '#526158',
    selected: '#E07A0B',
    hinted: '#4CE05F',
    dimAlpha: 0.93,
    suits: {
      bamboo: '#087A43',
      character: '#C42E2E',
      circle: '#174F9B',
      wind: '#194A86',
      dragonRed: '#C9282D',
      dragonGreen: '#087A43',
      dragonWhite: '#325D82',
      flower: '#A62A68',
      season: '#9A6812',
    },
  },
  bamboo: {
    name: 'bamboo',
    tileStyle: 'ivory',
    felt: '#315C35',
    feltEdge: '#173A24',
    tileFace: '#F6EEDB', tileFaceTop: '#FFFDF4', tileSide: '#15934D', tileEdge: '#064629',
    tileShadow: 'rgba(0, 10, 8, 0.72)', ink: '#143E34', inkSoft: '#526158', selected: '#E07A0B', hinted: '#75F0C1', dimAlpha: 0.93,
    suits: { bamboo: '#087A43', character: '#C42E2E', circle: '#174F9B', wind: '#194A86', dragonRed: '#C9282D', dragonGreen: '#087A43', dragonWhite: '#325D82', flower: '#A62A68', season: '#9A6812' },
  },
  plum: {
    name: 'plum',
    tileStyle: 'ivory',
    felt: '#642A45',
    feltEdge: '#351626',
    tileFace: '#FFF0DF', tileFaceTop: '#FFF9EF', tileSide: '#9B3D63', tileEdge: '#542137',
    tileShadow: 'rgba(28, 4, 17, 0.72)', ink: '#4A2532', inkSoft: '#765364', selected: '#E38A16', hinted: '#F4B8D3', dimAlpha: 0.92,
    suits: { bamboo: '#147A57', character: '#B72D37', circle: '#28519A', wind: '#4A3C79', dragonRed: '#C12B35', dragonGreen: '#147A57', dragonWhite: '#49657A', flower: '#9E2D68', season: '#9B6815' },
  },
  'calm-dark': {
    name: 'calm-dark',
    tileStyle: 'ivory',
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
    tileStyle: 'ivory',
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

/** Material choices are independent from accessibility appearance. */
export function paletteFor(theme: ThemeName, tileStyle: TileStyleName): Palette {
  const base = PALETTES[theme];
  if (theme !== 'calm' || tileStyle === 'ivory') return base;
  if (tileStyle === 'jade-edge') {
    return { ...base, tileStyle, tileSide: '#0B6035', tileEdge: '#033E25', tileShadow: 'rgba(0, 9, 5, 0.76)' };
  }
  if (tileStyle === 'brain') {
    return {
      ...base,
      tileStyle,
      tileFace: '#FFF6DC',
      tileFaceTop: '#FFFFFF',
      tileSide: '#00A467',
      tileEdge: '#004B35',
      selected: '#F0A51B',
      hinted: '#79F2C0',
      suits: {
        ...base.suits,
        bamboo: '#007C52',
        character: '#C64A25',
        circle: '#087A63',
        wind: '#075D4B',
        dragonRed: '#D84B2D',
        dragonGreen: '#007C52',
        dragonWhite: '#2B6B78',
      },
    };
  }
  return {
    ...base,
    tileStyle,
    tileFace: '#F1EFE7',
    tileFaceTop: '#FFFDF7',
    tileSide: '#C9C2AF',
    tileEdge: '#776E5B',
    tileShadow: 'rgba(0, 12, 10, 0.62)',
  };
}

export function suitKey(suit: string, rank: number): SuitKey {
  if (suit === 'dragon') return (['dragonRed', 'dragonGreen', 'dragonWhite'] as const)[rank - 1];
  return suit as SuitKey;
}
