import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => new Map<string, string>());

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: storage.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      storage.set(key, value);
    }),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios' },
}));

beforeEach(() => {
  storage.clear();
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('anonymous event delivery', () => {
  it('retains an event on device when the service is offline', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { track, flushTelemetry } = await import('../client');

    await track('app_open');
    await flushTelemetry();

    const queued = JSON.parse(storage.get('mahjongbrain.telemetry.queue.v1') ?? '[]');
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ name: 'app_open', sequence: 0 });
  });

  it('removes only a batch the server explicitly accounts for', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          contract: 'api/events/batch',
          version: '1',
          state: 'configured',
          fallback_reason: null,
          data: { accepted: 1, rejected: [], schemaVersion: 1 },
          error: null,
          generated_at: new Date().toISOString(),
        }),
      }),
    );
    const { track, flushTelemetry } = await import('../client');

    await track('app_open');
    await flushTelemetry();

    expect(JSON.parse(storage.get('mahjongbrain.telemetry.queue.v1') ?? '[]')).toEqual([]);
    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body));
    expect(body.anonymousDeviceId).toMatch(/^device_/);
    expect(body).not.toHaveProperty('accountId');
  });
});
