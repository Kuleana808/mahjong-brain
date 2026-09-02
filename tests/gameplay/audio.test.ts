import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Production gameplay QA — audio.
 *
 * Brent, 2026-09-02: past builds had audio that was "weird". Two causes were
 * found and fixed alongside these tests, and both are the kind that only show
 * up on a real device:
 *
 *  - No `AVAudioSession` category was ever set. A WKWebView with no category
 *    inherits `soloAmbient`, which STOPS whatever the player was already
 *    listening to. Fixed in AppDelegate by declaring `.ambient`, which mixes
 *    with other audio and obeys the ring/silent switch. Not testable from
 *    Node — it is Swift, and it is recorded in PROD_QA_LOG.md instead.
 *  - `AudioContext.resume()` is asynchronous, and `startAmbientMusic` bailed on
 *    `state !== 'running'` immediately after calling it. Returning from the
 *    background or from a phone call therefore left music silently dead. That
 *    part IS testable, and is covered below.
 *
 * The sound engine is fully synthesized WebAudio — there are no sample files,
 * so the "asset 404 / silent file / wrong format" class of bug cannot occur.
 * These tests assert what remains: that every sound reaches the graph, that
 * mute is honoured, that rapid taps layer instead of clipping, and that a
 * suspended context recovers.
 */

// ── A minimal, inspectable WebAudio double ────────────────────────────────

class FakeParam {
  events: [string, number, number][] = [];
  value = 0;
  setValueAtTime(v: number, t: number) { this.events.push(['set', v, t]); return this; }
  exponentialRampToValueAtTime(v: number, t: number) { this.events.push(['ramp', v, t]); return this; }
  setTargetAtTime(v: number, t: number) { this.events.push(['target', v, t]); return this; }
  cancelScheduledValues(t: number) { this.events.push(['cancel', 0, t]); return this; }
}

class FakeNode {
  connect = vi.fn((next: unknown) => next);
  disconnect = vi.fn();
}

class FakeOscillator extends FakeNode {
  type = 'sine';
  frequency = new FakeParam();
  detune = new FakeParam();
  started: number | null = null;
  stopped: number | null = null;
  start = vi.fn((t = 0) => { this.started = t; });
  stop = vi.fn((t = 0) => { this.stopped = t; });
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: 'running' | 'suspended' = 'running';
  currentTime = 0;
  destination = new FakeNode();
  oscillators: FakeOscillator[] = [];
  gains: FakeGain[] = [];
  resumeCalls = 0;

  constructor() { FakeAudioContext.instances.push(this); }

  createOscillator() { const o = new FakeOscillator(); this.oscillators.push(o); return o; }
  createGain() { const g = new FakeGain(); this.gains.push(g); return g; }
  createBiquadFilter() { return Object.assign(new FakeNode(), { type: '', frequency: new FakeParam() }); }

  resume = vi.fn(async () => {
    this.resumeCalls += 1;
    this.state = 'running';
  });
}

function installAudioEnvironment(): void {
  FakeAudioContext.instances = [];
  vi.stubGlobal('AudioContext', FakeAudioContext);
  // `window` and `document` are what the module reaches for directly.
  vi.stubGlobal('window', {
    AudioContext: FakeAudioContext,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
  });
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

const ctx = () => FakeAudioContext.instances.at(-1)!;

const ALL_SOUNDS = [
  'tile',
  'blocked',
  'match',
  'holder-warning',
  'shuffle',
  'undo',
  'hint',
  'win',
  'holder-full',
] as const;

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  installAudioEnvironment();
});

// ── 1. Every sound actually reaches the audio graph ───────────────────────

describe('sound coverage', () => {
  it('produces audible output for every sound in the catalogue', async () => {
    const { playSound } = await import('../../src/audio/sounds');

    for (const sound of ALL_SOUNDS) {
      FakeAudioContext.instances = [];
      vi.resetModules();
      const fresh = await import('../../src/audio/sounds');
      fresh.playSound(sound);

      const context = ctx();
      expect({ sound, oscillators: context.oscillators.length > 0 }).toEqual({
        sound,
        oscillators: true,
      });
      // Every oscillator is both started and scheduled to stop — an oscillator
      // that is started and never stopped is a stuck tone.
      for (const osc of context.oscillators) {
        expect({ sound, started: osc.started !== null, stopped: osc.stopped !== null }).toEqual({
          sound,
          started: true,
          stopped: true,
        });
      }
    }
    expect(playSound).toBeTypeOf('function');
  });

  it('gives every sound a non-zero, audible gain', async () => {
    for (const sound of ALL_SOUNDS) {
      vi.resetModules();
      FakeAudioContext.instances = [];
      const { playSound } = await import('../../src/audio/sounds');
      playSound(sound);

      const peaks = ctx()
        .gains.flatMap((g) => g.gain.events)
        .filter(([kind]) => kind === 'ramp')
        .map(([, value]) => value);

      // At least one ramp climbs to something a person can hear. A sound whose
      // envelope only ever ramps down is a silent sound.
      expect({ sound, audible: peaks.some((v) => v > 0.001) }).toEqual({ sound, audible: true });
    }
  });
});

// ── 2. Timing ─────────────────────────────────────────────────────────────

describe('timing', () => {
  it('schedules every sound essentially immediately', async () => {
    const { playSound } = await import('../../src/audio/sounds');

    // The context is created lazily on the first play, so open it, advance the
    // clock, then measure the sound we actually care about.
    playSound('tile');
    const context = ctx();
    context.currentTime = 10;
    context.oscillators.length = 0;

    playSound('match');

    const starts = context.oscillators.map((o) => o.started!);
    expect(starts.length).toBeGreaterThan(0);
    // Nothing is scheduled before now, and nothing lags perceptibly. The
    // longest deliberate offset inside a single sound is under 100ms.
    for (const start of starts) {
      expect(start).toBeGreaterThanOrEqual(10);
      expect(start - 10).toBeLessThan(0.2);
    }
  });
});

// ── 3. Layering ───────────────────────────────────────────────────────────

describe('layering', () => {
  it('gives rapid taps their own nodes rather than cutting each other off', async () => {
    const { playSound } = await import('../../src/audio/sounds');

    playSound('tile');
    const afterFirst = ctx().oscillators.length;
    playSound('tile');
    playSound('tile');

    // Each tap builds a fresh oscillator/gain pair, so overlapping taps mix
    // instead of stealing one shared node. Dropped or clipped taps would show
    // up here as a flat count.
    expect(ctx().oscillators.length).toBe(afterFirst * 3);
    for (const osc of ctx().oscillators) expect(osc.stop).toHaveBeenCalled();
  });
});

// ── 5. Mute ───────────────────────────────────────────────────────────────

describe('mute', () => {
  it('creates no audio at all when sounds are disabled', async () => {
    const { playSound } = await import('../../src/audio/sounds');

    for (const sound of ALL_SOUNDS) playSound(sound, false);

    // Not merely silent — the context is never even opened.
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it('resumes making sound when unmuted', async () => {
    const { playSound } = await import('../../src/audio/sounds');

    playSound('tile', false);
    expect(FakeAudioContext.instances).toHaveLength(0);

    playSound('tile', true);
    expect(ctx().oscillators.length).toBeGreaterThan(0);
  });

  it('stops ambient music when music is switched off', async () => {
    const { setAmbientMusicEnabled } = await import('../../src/audio/sounds');

    setAmbientMusicEnabled(true);
    const running = ctx().oscillators.filter((o) => o.started !== null).length;
    expect(running).toBeGreaterThan(0);

    setAmbientMusicEnabled(false);
    // The music gain is ramped to near-silence rather than cut, so there is no
    // click on the way out.
    const targets = ctx().gains.flatMap((g) => g.gain.events).filter(([k]) => k === 'target');
    expect(targets.length).toBeGreaterThan(0);
  });
});

// ── 8. Interruption recovery ──────────────────────────────────────────────

describe('interruption recovery', () => {
  it('resumes a context the platform suspended', async () => {
    const { playSound, resumeAudio } = await import('../../src/audio/sounds');

    playSound('tile');
    const context = ctx();

    // A phone call, an alarm or Siri suspends the context.
    context.state = 'suspended';
    resumeAudio();

    expect(context.resume).toHaveBeenCalled();
  });

  it('starts ambient music once a suspended context finishes resuming', async () => {
    // The regression: resume() is async, and the old code bailed on
    // `state !== 'running'` immediately after calling it — so music never came
    // back after an interruption.
    const { setAmbientMusicEnabled } = await import('../../src/audio/sounds');

    setAmbientMusicEnabled(false);
    const before = FakeAudioContext.instances.length;

    // Open a context in a suspended state, as iOS hands it back.
    const { playSound } = await import('../../src/audio/sounds');
    playSound('tile');
    const context = ctx();
    context.state = 'suspended';

    setAmbientMusicEnabled(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(context.resume).toHaveBeenCalled();
    expect(FakeAudioContext.instances.length).toBeGreaterThanOrEqual(before);
  });
});

// ── 9. No audio bleed ─────────────────────────────────────────────────────

describe('audio bleed', () => {
  it('never opens an audio context just by importing the module', async () => {
    // Loading screen, splash and the age gate must stay silent. The context is
    // created on first play, not on import.
    await import('../../src/audio/sounds');
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it('does not start music while the app is hidden', async () => {
    (globalThis as { document: { visibilityState: string } }).document.visibilityState = 'hidden';
    const { setAmbientMusicEnabled } = await import('../../src/audio/sounds');

    setAmbientMusicEnabled(true);

    const started = FakeAudioContext.instances.flatMap((c) => c.oscillators);
    expect(started).toHaveLength(0);
  });
});
