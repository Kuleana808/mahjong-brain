import { describe, expect, it } from 'vitest';

import { homeLevelBar } from '../FlowScreens';
import { TUNING, xpForLevel } from '../../../packages/core/src/progression/progression';

/**
 * Regression cover for the home screen's level bar.
 *
 * Reported by Brent, 2026-09-01: "the bar on the home screen looks like a
 * loading progress bar and i don't think it is."
 *
 * It is a real level-progress bar, but three things made it read as loading:
 *
 *  1. `.home-progress span` shared its green gradient fill with
 *     `.progress-track span` — the bar on the actual loading screen.
 *  2. It had no visible label. The only label was an `aria-label`, invisible
 *     to a sighted player.
 *  3. Its width was `Math.max(8, progress * 100)%`, so a brand-new player at
 *     zero XP saw an 8% sliver of green under the logo — which is precisely
 *     what "loading, 8% done" looks like.
 *
 * The fill is now amber (the committed level colour, matching the Play Level
 * button beneath it), the bar carries a visible "N XP to Level M" caption, and
 * the width floor is gone. These tests hold the two behavioural halves: the
 * fraction must be honest at zero, and the caption must have real numbers.
 */

describe('home level bar', () => {
  it('is genuinely empty for a brand-new player', () => {
    // The bug: this used to render at 8%, which reads as a loading bar.
    // widthPercent is the value actually applied to the fill element, so this
    // fails if the padded floor is reintroduced anywhere on the render path.
    const bar = homeLevelBar(0, 1);

    expect(bar.fraction).toBe(0);
    expect(bar.widthPercent).toBe(0);
  });

  it('tells a brand-new player what the bar is counting toward', () => {
    const bar = homeLevelBar(0, 1);

    expect(bar.nextLevel).toBe(2);
    expect(bar.xpToNext).toBe(xpForLevel(2));
    expect(bar.xpToNext).toBeGreaterThan(0);
  });

  it('fills proportionally partway through a level', () => {
    const floor = xpForLevel(2);
    const ceiling = xpForLevel(3);
    const halfway = floor + Math.round((ceiling - floor) / 2);

    const bar = homeLevelBar(halfway, 2);

    expect(bar.fraction).toBeGreaterThan(0.4);
    expect(bar.fraction).toBeLessThan(0.6);
    expect(bar.xpToNext).toBe(ceiling - halfway);
  });

  it('reaches an empty bar again immediately after a level-up', () => {
    // Landing exactly on a level boundary starts the next level at zero, and
    // the bar must show that rather than a floor.
    const bar = homeLevelBar(xpForLevel(3), 3);

    expect(bar.fraction).toBe(0);
    expect(bar.nextLevel).toBe(4);
    expect(bar.xpToNext).toBe(xpForLevel(4) - xpForLevel(3));
  });

  it('never reports negative XP remaining when XP overshoots the boundary', () => {
    // Progression is a ratchet and XP can sit above the level it was derived
    // from during reconciliation. "-40 XP to Level 3" must never render.
    const bar = homeLevelBar(xpForLevel(5), 2);

    expect(bar.xpToNext).toBe(0);
    expect(bar.xpToNext).toBeGreaterThanOrEqual(0);
  });

  it('keeps the fill inside the track for every level in a long run', () => {
    for (let level = 1; level <= 40; level += 1) {
      const floor = xpForLevel(level);
      const ceiling = xpForLevel(level + 1);
      for (const xp of [floor, floor + 1, Math.round((floor + ceiling) / 2), ceiling - 1]) {
        const bar = homeLevelBar(Math.max(0, xp), level);

        expect(bar.fraction).toBeGreaterThanOrEqual(0);
        expect(bar.fraction).toBeLessThanOrEqual(1);
        expect(bar.xpToNext).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('is driven by the shared tuning table rather than its own constants', () => {
    // If the XP curve is retuned, the bar must follow it. This fails if
    // someone reintroduces a hardcoded width or curve inside the component.
    const oneBoard = TUNING.xpPerPair * 4 + TUNING.xpBoardCompleteBonus;
    const bar = homeLevelBar(oneBoard, 1);

    expect(bar.xpToNext).toBe(xpForLevel(2) - oneBoard);
  });
});
