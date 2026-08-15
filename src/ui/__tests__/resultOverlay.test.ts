import { describe, expect, it } from 'vitest';

import { shouldRenderGameplayFrame } from '../App';

describe('result overlay gameplay context', () => {
  it('keeps the board frame mounted while the holder-full or completion result is shown', () => {
    expect(shouldRenderGameplayFrame('gameplay')).toBe(true);
    expect(shouldRenderGameplayFrame('game_over')).toBe(true);
  });

  it('does not mount gameplay behind onboarding or home', () => {
    expect(shouldRenderGameplayFrame('home')).toBe(false);
    expect(shouldRenderGameplayFrame('tos')).toBe(false);
  });
});
