import { describe, expect, it } from 'vitest';

import {
  AMBIENT_INTERVAL_SECONDS,
  AMBIENT_NOTES,
  AMBIENT_PEAK,
  MIN_FREQUENCY_HZ,
  SOUND_SPECS,
  ambientNote,
  type GameSound,
  type SoundSpec,
} from '../../src/audio/spec';

/**
 * Spectral regression for the hum.
 *
 * Brent, 2026-09-02: "there is a hum for the sound in the app that isn't
 * pleasant", and asked for a script that analyses the shipped audio for DC
 * offset and persistent low-frequency energy.
 *
 * There are no audio FILES to analyse — every sound is synthesized. So instead
 * of decoding assets, this renders the real sound specs to a buffer with plain
 * arithmetic and measures the result. That is strictly better than analysing
 * files would have been: it tests what the app will actually emit, and it
 * catches a bad sound before anyone renders it to disk.
 *
 * What it is guarding against, concretely: the ambient bed used to be three
 * oscillators at 146.83 / 220 / 293.66 Hz that were started once and never
 * stopped. Rendered, that is a constant low tone — the hum. The measurements
 * below fail on exactly that shape.
 */

const SAMPLE_RATE = 44_100;

/** Renders a spec to mono float samples, mirroring what WebAudio will do. */
function renderSpec(spec: SoundSpec, seconds: number): Float32Array {
  const out = new Float32Array(Math.ceil(seconds * SAMPLE_RATE));

  for (const p of spec.partials) {
    const attack = p.attack ?? 0.006;
    const start = Math.floor(p.at * SAMPLE_RATE);
    const frames = Math.ceil(p.duration * SAMPLE_RATE);
    for (let i = 0; i < frames; i += 1) {
      const idx = start + i;
      if (idx < 0 || idx >= out.length) continue;
      const t = i / SAMPLE_RATE;
      // Exponential attack then exponential decay, matching the WebAudio ramps.
      const env =
        t < attack
          ? t / attack
          : Math.exp(-4 * ((t - attack) / Math.max(1e-6, p.duration - attack)));
      const phase = 2 * Math.PI * p.freq * t;
      const sample =
        p.wave === 'sine'
          ? Math.sin(phase)
          : // Triangle from its first few odd harmonics — close enough for a
            // spectral measurement, and deterministic.
            (8 / Math.PI ** 2) *
            (Math.sin(phase) - Math.sin(3 * phase) / 9 + Math.sin(5 * phase) / 25);
      out[idx] += sample * env * p.peak;
    }
  }

  for (const n of spec.noise ?? []) {
    const attack = n.attack ?? 0.002;
    const start = Math.floor(n.at * SAMPLE_RATE);
    const frames = Math.ceil(n.duration * SAMPLE_RATE);
    // One-pole lowpass, then a one-pole highpass at 150 Hz to mirror the
    // backstop filter in the player.
    const lpA = Math.exp((-2 * Math.PI * n.cutoff) / SAMPLE_RATE);
    const hpA = Math.exp((-2 * Math.PI * 150) / SAMPLE_RATE);
    let lp = 0;
    let hpPrevIn = 0;
    let hpPrevOut = 0;
    // Deterministic pseudo-noise so the test cannot flake.
    let seed = 12345;
    for (let i = 0; i < frames; i += 1) {
      const idx = start + i;
      if (idx < 0 || idx >= out.length) continue;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const white = (seed / 0x3fffffff) - 1;
      lp = white * (1 - lpA) + lp * lpA;
      const hp = hpA * (hpPrevOut + lp - hpPrevIn);
      hpPrevIn = lp;
      hpPrevOut = hp;
      const t = i / SAMPLE_RATE;
      const env =
        t < attack
          ? t / attack
          : Math.exp(-4 * ((t - attack) / Math.max(1e-6, n.duration - attack)));
      out[idx] += hp * env * n.peak;
    }
  }

  return out;
}

/** Mean sample value. A non-zero mean is a DC offset. */
function dcOffset(buffer: Float32Array): number {
  let sum = 0;
  for (const s of buffer) sum += s;
  return sum / buffer.length;
}

/** RMS energy in a frequency band, by Goertzel-style correlation. */
function bandEnergy(buffer: Float32Array, freq: number): number {
  let re = 0;
  let im = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const phase = (2 * Math.PI * freq * i) / SAMPLE_RATE;
    re += buffer[i] * Math.cos(phase);
    im += buffer[i] * Math.sin(phase);
  }
  return Math.sqrt(re * re + im * im) / buffer.length;
}

function peakAmplitude(buffer: Float32Array): number {
  let peak = 0;
  for (const s of buffer) peak = Math.max(peak, Math.abs(s));
  return peak;
}

const ALL_SOUNDS = Object.keys(SOUND_SPECS) as GameSound[];

// ── The specs themselves ──────────────────────────────────────────────────

describe('sound specifications', () => {
  it('contains no partial below the hum threshold', () => {
    for (const sound of ALL_SOUNDS) {
      for (const p of SOUND_SPECS[sound].partials) {
        expect({ sound, freq: p.freq, ok: p.freq >= MIN_FREQUENCY_HZ }).toEqual({
          sound,
          freq: p.freq,
          ok: true,
        });
      }
    }
  });

  it('never leaves a tone sustaining', () => {
    // The hum was an oscillator with no stop. Every partial must be finite and
    // short enough to decay well before the next ambient note arrives.
    for (const sound of ALL_SOUNDS) {
      for (const p of SOUND_SPECS[sound].partials) {
        expect(p.duration).toBeGreaterThan(0);
        expect({ sound, duration: p.duration, bounded: p.duration <= 3 }).toEqual({
          sound,
          duration: p.duration,
          bounded: true,
        });
      }
    }
  });

  it('keeps every effect brief except the win flourish', () => {
    for (const sound of ALL_SOUNDS) {
      const spec = SOUND_SPECS[sound];
      const end = Math.max(
        0,
        ...spec.partials.map((p) => p.at + p.duration),
        ...(spec.noise ?? []).map((n) => n.at + n.duration),
      );
      const limit = sound === 'win' ? 2.0 : 0.55;
      expect({ sound, end: Number(end.toFixed(3)), withinLimit: end <= limit }).toEqual({
        sound,
        end: Number(end.toFixed(3)),
        withinLimit: true,
      });
    }
  });
});

// ── The rendered audio ────────────────────────────────────────────────────

describe('rendered audio', () => {
  it('has no meaningful DC offset in any sound', () => {
    for (const sound of ALL_SOUNDS) {
      const buffer = renderSpec(SOUND_SPECS[sound], 2.5);
      const offset = Math.abs(dcOffset(buffer));
      // A DC offset wastes headroom and thumps on small speakers when playback
      // starts and stops.
      expect({ sound, offset: Number(offset.toFixed(6)), ok: offset < 1e-3 }).toEqual({
        sound,
        offset: Number(offset.toFixed(6)),
        ok: true,
      });
    }
  });

  it('has no persistent low-frequency energy in any sound', () => {
    // 50 Hz and 60 Hz are mains hum; 120 Hz is its second harmonic; 146.83 Hz
    // is the exact note the old ambient drone sat on.
    for (const sound of ALL_SOUNDS) {
      const buffer = renderSpec(SOUND_SPECS[sound], 2.5);
      const reference = peakAmplitude(buffer);
      for (const freq of [50, 60, 120, 146.83]) {
        const energy = bandEnergy(buffer, freq);
        const ratio = reference > 0 ? energy / reference : 0;
        expect({ sound, freq, hum: ratio > 0.02 }).toEqual({ sound, freq, hum: false });
      }
    }
  });

  it('never clips', () => {
    for (const sound of ALL_SOUNDS) {
      const peak = peakAmplitude(renderSpec(SOUND_SPECS[sound], 2.5));
      expect({ sound, peak: Number(peak.toFixed(4)), clipping: peak >= 1 }).toEqual({
        sound,
        peak: Number(peak.toFixed(4)),
        clipping: false,
      });
    }
  });
});

// ── The ambient bed, which is where the hum lived ─────────────────────────

describe('the ambient bed', () => {
  it('uses only notes above the hum threshold', () => {
    for (const freq of AMBIENT_NOTES) {
      expect({ freq, ok: freq >= MIN_FREQUENCY_HZ }).toEqual({ freq, ok: true });
    }
  });

  it('decays to silence between notes rather than sustaining', () => {
    // THE regression. A drone is a note whose energy never falls. Render one
    // ambient note over a full interval and confirm the tail is silent well
    // before the next note is due.
    const buffer = renderSpec(ambientNote(0), AMBIENT_INTERVAL_SECONDS);
    const peak = peakAmplitude(buffer);

    const tailStart = Math.floor(3.0 * SAMPLE_RATE);
    const tail = buffer.slice(tailStart);
    const tailPeak = peakAmplitude(tail);

    expect(peak).toBeGreaterThan(0.005);
    expect(tailPeak / peak).toBeLessThan(0.01);
  });

  it('carries no low-frequency energy across a whole phrase', () => {
    // Render several consecutive notes end to end, which is what a listener
    // actually hears, and look for a sustained low tone across the lot.
    const seconds = AMBIENT_INTERVAL_SECONDS * 4;
    const phrase = new Float32Array(Math.ceil(seconds * SAMPLE_RATE));
    for (let i = 0; i < 4; i += 1) {
      const note = renderSpec(ambientNote(i), 3.0);
      const offset = Math.floor(i * AMBIENT_INTERVAL_SECONDS * SAMPLE_RATE);
      for (let j = 0; j < note.length && offset + j < phrase.length; j += 1) {
        phrase[offset + j] += note[j];
      }
    }

    const reference = peakAmplitude(phrase);
    for (const freq of [50, 60, 120, 146.83]) {
      const ratio = bandEnergy(phrase, freq) / reference;
      expect({ freq, hum: ratio > 0.02 }).toEqual({ freq, hum: false });
    }
    expect(Math.abs(dcOffset(phrase))).toBeLessThan(1e-3);
  });

  it('stays quieter than the quietest sound effect', () => {
    // Music must never compete with feedback. This is the volume-balance check
    // that was previously only an inspection judgement.
    // Compare against each sound's LOUDEST partial — that is how loud the
    // sound actually is. Comparing against the quietest partial would measure a
    // decorative overtone, not a sound.
    const quietestEffect = Math.min(
      ...ALL_SOUNDS.map((s) =>
        Math.max(
          0,
          ...SOUND_SPECS[s].partials.map((p) => p.peak),
          ...(SOUND_SPECS[s].noise ?? []).map((n) => n.peak),
        ),
      ),
    );
    expect(AMBIENT_PEAK).toBeLessThanOrEqual(quietestEffect);
  });

  it('does not repeat on a short cycle', () => {
    // A short loop is the other way ambient music becomes irritating.
    expect(AMBIENT_NOTES.length).toBeGreaterThanOrEqual(8);
    const cycleSeconds = AMBIENT_NOTES.length * AMBIENT_INTERVAL_SECONDS;
    expect(cycleSeconds).toBeGreaterThan(30);
  });
});
