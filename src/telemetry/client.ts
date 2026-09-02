import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

import {
  EVENT_SCHEMA_VERSION,
  type ClientEvent,
  type EventBatch,
  type EventName,
  type EventProperties,
} from '../../packages/core/src/telemetry/events';
import type { EventsBatchResponse } from '../../packages/core/src/contracts/types';
import { apiConfigured, apiRequest } from '../services/api';

const DEVICE_KEY = 'mahjongbrain.telemetry.device.v1';
const QUEUE_KEY = 'mahjongbrain.telemetry.queue.v1';
const MAX_LOCAL_EVENTS = 1_000;
const FLUSH_AT = 12;

const id = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

let anonymousDeviceId = '';
let queue: ClientEvent[] = [];
let sequence = 0;
let initialising: Promise<void> | null = null;
let flushing: Promise<void> | null = null;
const sessionId = id('session');

function appVersion(): string {
  return import.meta.env.VITE_APP_VERSION?.trim() || '0.1.0';
}

function platform(): EventBatch['platform'] {
  const value = Capacitor.getPlatform();
  return value === 'ios' || value === 'android' ? value : 'web';
}

async function initialise(): Promise<void> {
  if (anonymousDeviceId) return;
  if (initialising) return initialising;
  initialising = (async () => {
    const [storedDevice, storedQueue] = await Promise.all([
      Preferences.get({ key: DEVICE_KEY }),
      Preferences.get({ key: QUEUE_KEY }),
    ]);
    anonymousDeviceId = storedDevice.value || id('device');
    if (!storedDevice.value) {
      await Preferences.set({ key: DEVICE_KEY, value: anonymousDeviceId });
    }
    try {
      const parsed = JSON.parse(storedQueue.value || '[]') as ClientEvent[];
      queue = Array.isArray(parsed) ? parsed.slice(-MAX_LOCAL_EVENTS) : [];
      sequence = queue.reduce((max, event) => Math.max(max, event.sequence + 1), 0);
    } catch {
      queue = [];
    }
  })();
  return initialising;
}

async function persistQueue(): Promise<void> {
  await Preferences.set({ key: QUEUE_KEY, value: JSON.stringify(queue) });
}

/**
 * Records only closed-catalogue, non-identifying events. Delivery is best
 * effort and offline safe: a missing backend never interrupts gameplay.
 */
export async function track(name: EventName, properties?: EventProperties): Promise<void> {
  await initialise();
  queue.push({ name, at: new Date().toISOString(), sequence: sequence++, properties });
  if (queue.length > MAX_LOCAL_EVENTS) queue = queue.slice(-MAX_LOCAL_EVENTS);
  await persistQueue();
  if (queue.length >= FLUSH_AT) void flushTelemetry();
}

export async function flushTelemetry(): Promise<void> {
  await initialise();
  if (!apiConfigured() || queue.length === 0) return;
  if (flushing) return flushing;

  flushing = (async () => {
    const sending = queue.slice(0, 500);
    try {
      const envelope = await apiRequest<EventsBatchResponse>('/api/events/batch', {
        method: 'POST',
        body: {
          schemaVersion: EVENT_SCHEMA_VERSION,
          anonymousDeviceId,
          sessionId,
          appVersion: appVersion(),
          platform: platform(),
          events: sending,
        } satisfies EventBatch,
      });
      if (!envelope.data || envelope.data.accepted + envelope.data.rejected.length !== sending.length) {
        return;
      }
      queue = queue.slice(sending.length);
      await persistQueue();
    } catch {
      // The queue remains on device and retries after another interaction.
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

export function startTelemetryLifecycle(): () => void {
  void track('app_open');
  void track('session_start');
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      void track('app_background');
      void flushTelemetry();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    void track('session_end');
    void flushTelemetry();
  };
}
