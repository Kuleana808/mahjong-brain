import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { TileFace } from '../../../packages/core/src/game/tiles';
import { PALETTES } from '../../render/palette';
import { TileFaceCanvas } from '../TileFaceCanvas';

describe('TileFaceCanvas', () => {
  it.each([
    { suit: 'character', rank: 3 },
    { suit: 'circle', rank: 7 },
    { suit: 'wind', rank: 2 },
    { suit: 'dragon', rank: 1 },
  ] satisfies TileFace[])('preserves the exact $suit-$rank face identity in the holder', (face) => {
    const markup = renderToStaticMarkup(
      createElement(TileFaceCanvas, { face, palette: PALETTES.calm }),
    );

    expect(markup).toContain(`data-face="${face.suit}-${face.rank}"`);
    expect(markup).not.toContain(`${face.rank}●`);
    expect(markup).not.toContain(`${face.rank}竹`);
  });
});
