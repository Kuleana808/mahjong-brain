import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiRequest, ApiUnavailableError } from '../api';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('contract transport', () => {
  it('fails closed when no production API is configured', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    await expect(apiRequest('/api/settings')).rejects.toBeInstanceOf(ApiUnavailableError);
  });

  it('returns a valid contract envelope', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example/');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          contract: 'api/settings',
          version: '1',
          state: 'configured',
          fallback_reason: null,
          data: { revision: 1 },
          error: null,
          generated_at: new Date().toISOString(),
        }),
      }),
    );

    const response = await apiRequest<{ revision: number }>('/api/settings');
    expect(response.data?.revision).toBe(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example/api/settings',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('does not turn a backend refusal into success', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          contract: 'api/unlock-status',
          version: '1',
          state: 'source_available',
          fallback_reason: 'not configured',
          data: null,
          error: { code: 'not_configured', message: 'Unavailable.' },
          generated_at: new Date().toISOString(),
        }),
      }),
    );

    await expect(apiRequest('/api/unlock-status')).rejects.toMatchObject({
      name: 'ApiContractError',
      code: 'not_configured',
    });
  });
});
