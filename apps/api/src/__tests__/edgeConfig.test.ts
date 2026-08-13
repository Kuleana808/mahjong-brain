import { describe, expect, it } from 'vitest';

import { createEdgePorts } from '../edgeConfig';

describe('Supabase Edge configuration', () => {
  it('never enables a development memory store', () => {
    const values: Record<string, string> = { MAHJONG_BRAIN_DEV_STORE: 'memory' };
    const report = createEdgePorts((key) => values[key]);
    expect(report.ports.store).toBeUndefined();
    expect(report.lines).toContain('store       DISABLED — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
  });

  it('reports production secrets as disabled when absent', () => {
    const report = createEdgePorts(() => undefined);
    expect(report.lines.every((line) => line.includes('DISABLED'))).toBe(true);
    expect(report.ports).toEqual({});
  });
});
