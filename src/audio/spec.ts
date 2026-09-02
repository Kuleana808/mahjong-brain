/**
 * Every sound in the game, described as data rather than as imperative
 * WebAudio calls.
 *
 * Two reasons this is a data model:
 *
 * 1. **It can be analysed.** WebAudio does not exist in Node, so the old
 *    imperative code could only be tested by asserting that oscillators were
 *    created — which cannot tell you what the audio SOUNDS like. A spec can be
 *    rendered to a buffer by plain arithmetic and inspected for DC offset and
 *    low-frequency energy. That is what caught the hum.
 *
 * 2. **The hum was a design problem, not a bug.** Brent, 2026-09-02: "there is
 *    a hum for the sound in the app that isn't pleasant". The ambient bed was
 *    three oscillators at 146.83 / 220 / 293.66 Hz, started once and never
 *    stopped or modulated — a sustained D chord under a 920 Hz lowpass. That is
 *    not music with a hum in it; it is a hum. Writing sounds down as data made
 *    that obvious at a glance.
 *
 * ── Rules every sound here follows ────────────────────────────────────────
 *
 * - **Nothing sustains.** Every partial has a finite duration and decays to
 *   silence. There is no continuously running oscillator anywhere, so there is
 *   nothing that can drone.
 * - **Nothing below 180 Hz.** Sustained energy under ~150 Hz is what the ear
 *   reads as hum, and small phone speakers reproduce it as a rattle. The
 *   lowest partial in the game is now 196 Hz (G3).
 * - **Envelopes start and end at silence**, so nothing clicks on or off.
 */

export type GameSound =
  | 'tile'
  | 'blocked'
  | 'match'
  | 'holder-warning'
  | 'shuffle'
  | 'undo'
  | 'hint'
  | 'win'
  | 'holder-full'
  | 'level-up';

export type Wave = 'sine' | 'triangle';

/** One tone: a frequency with an attack-decay envelope. */
export interface Partial {
  readonly freq: number;
  readonly wave: Wave;
  /** Seconds from the start of the sound. */
  readonly at: number;
  readonly duration: number;
  /** Peak linear gain. */
  readonly peak: number;
  /** Attack time. Short for percussive, longer for pads. */
  readonly attack?: number;
}

/**
 * A band-limited noise burst — what makes a wooden click sound like wood and a
 * shuffle sound like paper. The previous sounds were pure tones only, which is
 * why a tile tap read as a beep rather than as a tile.
 */
export interface Noise {
  readonly at: number;
  readonly duration: number;
  readonly peak: number;
  /** Lowpass cutoff. Lower is duller and woodier. */
  readonly cutoff: number;
  readonly attack?: number;
}

export interface SoundSpec {
  readonly partials: readonly Partial[];
  readonly noise?: readonly Noise[];
}

/**
 * The lowest frequency any sound is permitted to contain.
 *
 * Enforced by a test. Anything under this is the hum coming back.
 */
export const MIN_FREQUENCY_HZ = 180;

// A pentatonic set well clear of the hum region. Pentatonic because any two
// notes in it sound intentional together, which is what lets the ambient bed
// pick notes at random without ever sounding wrong.
const G3 = 196.0;
const A3 = 220.0;
const D4 = 293.66;
const E4 = 329.63;
const G4 = 392.0;
const A4 = 440.0;
const C5 = 523.25;
const D5 = 587.33;
const E5 = 659.25;
const G5 = 783.99;

/** A struck tone with its first overtone — reads as a small bell or a chime. */
function bell(freq: number, at: number, duration: number, peak: number): Partial[] {
  return [
    { freq, wave: 'sine', at, duration, peak, attack: 0.006 },
    // The octave above, quieter and shorter, gives the strike its brightness.
    { freq: freq * 2, wave: 'sine', at, duration: duration * 0.55, peak: peak * 0.32, attack: 0.004 },
  ];
}

export const SOUND_SPECS: Record<GameSound, SoundSpec> = {
  /**
   * Tile tap: a wooden click.
   *
   * Mostly a short, dull noise burst — the sound of one tile against another —
   * with a quiet tone under it for pitch. The old version was a pure 1260 Hz
   * triangle, which read as a beep.
   */
  tile: {
    noise: [{ at: 0, duration: 0.045, peak: 0.05, cutoff: 2600, attack: 0.001 }],
    partials: [{ freq: 420, wave: 'triangle', at: 0, duration: 0.07, peak: 0.02, attack: 0.002 }],
  },

  /** Blocked: a soft, low thud. Deliberately dull and short — a refusal, not an alarm. */
  blocked: {
    noise: [{ at: 0, duration: 0.06, peak: 0.028, cutoff: 700, attack: 0.002 }],
    partials: [{ freq: G3, wave: 'sine', at: 0, duration: 0.11, peak: 0.02, attack: 0.004 }],
  },

  /** Match: the reward. A two-note rising chime over the tile click. */
  match: {
    noise: [{ at: 0, duration: 0.035, peak: 0.03, cutoff: 3000, attack: 0.001 }],
    partials: [...bell(E5, 0.01, 0.3, 0.045), ...bell(G5, 0.075, 0.42, 0.038)],
  },

  /** Holder warning: three of four slots used. Rising, unresolved, not alarming. */
  'holder-warning': {
    partials: [...bell(C5, 0, 0.22, 0.032), ...bell(D5, 0.11, 0.3, 0.03)],
  },

  /** Shuffle: tiles sliding. A run of short noise bursts, brightening slightly. */
  shuffle: {
    noise: Array.from({ length: 7 }, (_, i) => ({
      at: i * 0.042,
      duration: 0.06,
      peak: 0.026 - i * 0.002,
      cutoff: 1500 + i * 260,
      attack: 0.004,
    })),
    partials: [],
  },

  /** Undo: a short descending pair. The inverse shape of a match. */
  undo: {
    partials: [...bell(D5, 0, 0.16, 0.028), ...bell(A4, 0.06, 0.24, 0.026)],
  },

  /** Hint: a gentle two-note question. Rising, quiet, easy to ignore. */
  hint: {
    partials: [...bell(A4, 0, 0.2, 0.026), ...bell(E5, 0.08, 0.3, 0.024)],
  },

  /** Win: a brief four-note flourish, about a second and a half. Warm, not triumphant. */
  win: {
    partials: [
      ...bell(C5, 0, 0.5, 0.04),
      ...bell(E5, 0.12, 0.5, 0.04),
      ...bell(G5, 0.24, 0.6, 0.042),
      ...bell(C5 * 2, 0.38, 1.0, 0.036),
    ],
  },

  /** Holder full: the round paused. Two descending tones. Sympathetic, not punishing. */
  'holder-full': {
    partials: [...bell(D4, 0, 0.3, 0.03), ...bell(A3, 0.13, 0.4, 0.028)],
  },

  /** Level up: a short sparkle. Four quick ascending notes. */
  'level-up': {
    partials: [
      ...bell(G4, 0, 0.18, 0.03),
      ...bell(C5, 0.07, 0.18, 0.032),
      ...bell(E5, 0.14, 0.22, 0.034),
      ...bell(G5, 0.21, 0.32, 0.036),
    ],
  },
};

/**
 * The ambient bed, as a repeating sequence of struck notes.
 *
 * This replaces the drone. Instead of three oscillators running forever, the
 * bed plays ONE soft bell every few seconds from the pentatonic set, each one
 * decaying to silence before the next arrives. There is near-silence between
 * notes, which is what makes it a calm background rather than a tone.
 *
 * Notes are chosen by index rather than at random so the sequence is
 * reproducible in a test, and the sequence length is coprime with the phrase
 * length so it does not audibly repeat on a short cycle.
 */
export const AMBIENT_NOTES: readonly number[] = [D4, G4, A4, C5, G4, E4, A4, D5, C5, G4, E5, A4, G4];

/** Seconds between ambient notes. Slow enough to read as space, not as a melody. */
export const AMBIENT_INTERVAL_SECONDS = 3.4;

/**
 * Peak gain of an ambient note.
 *
 * Must stay at or below the quietest sound EFFECT, so music never competes with
 * feedback. It was 0.022 against a quietest effect of 0.02 — marginally louder,
 * which the balance test caught.
 */
export const AMBIENT_PEAK = 0.016;

export function ambientNote(index: number): SoundSpec {
  const freq = AMBIENT_NOTES[index % AMBIENT_NOTES.length];
  return { partials: bell(freq, 0, 2.6, AMBIENT_PEAK) };
}
