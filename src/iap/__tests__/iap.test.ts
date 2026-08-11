import { describe, expect, it } from 'vitest';

import { purchases, purchasesConfigured } from '..';

describe('release purchase boundary', () => {
  it('fails closed until a real native provider is configured', async () => {
    expect(purchasesConfigured()).toBe(false);
    expect(await purchases().isUnlocked()).toBeNull();
    expect((await purchases().purchase()).status).toBe('unavailable');
    expect((await purchases().restore()).status).toBe('unavailable');
  });
});
