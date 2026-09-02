import { describe, expect, it } from 'vitest';

import { shouldAnimateTileToHolder } from '../BoardView';

describe('board tile flight eligibility', () => {
  it('animates only a free tile during normal motion', () => {
    expect(shouldAnimateTileToHolder(true, false, false)).toBe(true);
  });

  it('never flies a blocked tile into the holder', () => {
    expect(shouldAnimateTileToHolder(false, false, false)).toBe(false);
  });

  it('keeps reduced motion and the active-flight lock authoritative', () => {
    expect(shouldAnimateTileToHolder(true, false, true)).toBe(false);
    expect(shouldAnimateTileToHolder(true, true, false)).toBe(false);
  });
});
