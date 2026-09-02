import { describe, expect, it } from 'vitest';

import { PALETTES, paletteFor } from '../palette';

describe('tile material choices', () => {
  it('keeps approved ivory as the default material', () => {
    expect(paletteFor('calm', 'ivory')).toBe(PALETTES.calm);
  });

  it('changes tile construction without changing the felt', () => {
    const ivory = paletteFor('calm', 'ivory');
    const jade = paletteFor('calm', 'jade-edge');
    const porcelain = paletteFor('calm', 'porcelain');
    const brain = paletteFor('calm', 'brain');

    expect(jade.felt).toBe(ivory.felt);
    expect(jade.tileSide).not.toBe(ivory.tileSide);
    expect(porcelain.tileFace).not.toBe(ivory.tileFace);
    expect(brain.tileStyle).toBe('brain');
    expect(brain.tileSide).not.toBe(jade.tileSide);
    expect(brain.suits.circle).not.toBe(ivory.suits.circle);
  });

  it('preserves accessibility palettes over cosmetic materials', () => {
    expect(paletteFor('high-contrast', 'jade-edge')).toBe(PALETTES['high-contrast']);
  });
});
