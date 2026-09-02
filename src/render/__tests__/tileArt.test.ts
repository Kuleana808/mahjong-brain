import { describe, expect, it } from 'vitest';

import { circleMotifGeometry } from '../tileArt';

describe('circle tile artwork', () => {
  it.each([2, 3, 4, 5, 6, 7, 8, 9])(
    'keeps rank %i circles visibly separated at minimum phone tile size',
    (rank) => {
      const { radius, nearestSpacing } = circleMotifGeometry(rank, {
        w: 66 * 0.89,
        h: 82.5 * 0.84,
      });

      expect(radius * 2).toBeLessThanOrEqual(nearestSpacing * 0.72);
    },
  );
});
