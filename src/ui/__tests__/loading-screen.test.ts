import { describe, expect, it } from 'vitest';

import { loadingShouldRemainParked } from '../FlowScreens';

describe('loading screen QA behavior', () => {
  it('parks only deliberate loading-screen fixtures in development', () => {
    expect(loadingShouldRemainParked('?qa=S03-loading', true)).toBe(true);
    expect(loadingShouldRemainParked('?qa=S03-loading-offline', true)).toBe(true);
    expect(loadingShouldRemainParked('?qa=S08-game-empty', true)).toBe(false);
  });

  it('does not let a missing or invalid fixture trap the loading screen', () => {
    expect(loadingShouldRemainParked('?qa', true)).toBe(false);
    expect(loadingShouldRemainParked('?qa=unknown', true)).toBe(false);
    expect(loadingShouldRemainParked('', true)).toBe(false);
  });

  it('never parks a production build', () => {
    expect(loadingShouldRemainParked('?qa=S03-loading', false)).toBe(false);
  });
});
