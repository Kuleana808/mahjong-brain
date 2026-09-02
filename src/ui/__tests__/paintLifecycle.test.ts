import { describe, expect, it, vi } from 'vitest';

import { paintInitialFrame } from '../paintLifecycle';

describe('board paint lifecycle', () => {
  it('paints immediately even when animation frames are suspended', () => {
    const paint = vi.fn();
    const suspendedAnimationFrame = vi.fn();

    paintInitialFrame(paint, 42);

    expect(paint).toHaveBeenCalledOnce();
    expect(paint).toHaveBeenCalledWith(42);
    expect(suspendedAnimationFrame).not.toHaveBeenCalled();
  });
});
