/**
 * Original, synthesized game sounds.
 *
 * Every sound is described in `spec.ts` as data; this file is only the part
 * that talks to WebAudio. Audio is created lazily from the player's first
 * gesture and every failure is a silent no-op, so sound can never block
 * gameplay.
 *
 * ── Why the ambient bed works the way it does ─────────────────────────────
 *
 * Brent, 2026-09-02: "there is a hum for the sound in the app that isn't
 * pleasant".
 *
 * The previous ambient bed was three oscillators at 146.83 / 220 / 293.66 Hz,
 * started once and never stopped or modulated, under a 920 Hz lowpass. That is
 * a sustained low chord playing forever — the acoustic definition of a hum. It
 * was not music with a defect; the "music" WAS the hum.
 *
 * It is now a slow sequence of struck bell tones, one every few seconds, each
 * decaying to silence before the next. Nothing sustains, so nothing can drone,
 * and the space between notes is what makes it read as calm rather than as a
 * tone. Enforced by test: no sound in the game contains a partial below 180 Hz,
 * and the rendered bed has no sustained low-frequency energy.
 */

import {
  AMBIENT_INTERVAL_SECONDS,
  ambientNote,
  SOUND_SPECS,
  type GameSound,
  type SoundSpec,
} from './spec';

export type { GameSound } from './spec';

let context: AudioContext | null = null;
let musicEnabled = false;
let ambientTimer: number | null = null;
let ambientIndex = 0;
let gestureListenerInstalled = false;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return null;
  context ??= new AudioContextClass();
  if (context.state === 'suspended') void context.resume();
  return context;
}

/**
 * A short burst of band-limited noise.
 *
 * This is what makes a tile tap sound like wood rather than like a beep. The
 * buffer is generated per burst; they are short enough that caching would save
 * nothing worth the added state.
 */
function noiseBurst(
  ctx: AudioContext,
  at: number,
  duration: number,
  peak: number,
  cutoff: number,
  attack: number,
): void {
  const frames = Math.max(1, Math.ceil(duration * ctx.sampleRate));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Mean-zero noise. A biased source would put a DC offset into the output,
  // which is inaudible on its own but wastes headroom and can thump on cheap
  // speakers when it starts and stops.
  for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;

  // Everything is high-passed at 150 Hz on the way out. Nothing in the game is
  // supposed to have energy down there, and this is the backstop that keeps a
  // future sound from reintroducing the hum.
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 150;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  source.connect(filter).connect(highpass).connect(gain).connect(ctx.destination);
  source.start(at);
  source.stop(at + duration + 0.02);
}

function tone(
  ctx: AudioContext,
  freq: number,
  wave: OscillatorType,
  at: number,
  duration: number,
  peak: number,
  attack: number,
): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(freq, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(at);
  // Always stopped. A started oscillator with no stop is a tone that never
  // ends, which is how the old ambient bed became a hum.
  oscillator.stop(at + duration + 0.02);
}

function render(ctx: AudioContext, spec: SoundSpec, startAt: number): void {
  for (const p of spec.partials) {
    tone(ctx, p.freq, p.wave, startAt + p.at, p.duration, p.peak, p.attack ?? 0.006);
  }
  for (const n of spec.noise ?? []) {
    noiseBurst(ctx, startAt + n.at, n.duration, n.peak, n.cutoff, n.attack ?? 0.002);
  }
}

export function playSound(sound: GameSound, enabled = true): void {
  if (!enabled) return;
  try {
    const ctx = audioContext();
    if (!ctx) return;
    render(ctx, SOUND_SPECS[sound], ctx.currentTime + 0.004);
  } catch {
    // Audio availability and permissions never affect the play loop.
  }
}

function stopAmbientMusic(): void {
  if (ambientTimer !== null) {
    window.clearTimeout(ambientTimer);
    ambientTimer = null;
  }
  // Notes already scheduled decay to silence on their own within a few
  // seconds. There is nothing sustaining to cut off.
}

function scheduleNextAmbientNote(): void {
  if (!musicEnabled || typeof window === 'undefined') return;
  if (document.visibilityState === 'hidden') return;

  const ctx = audioContext();
  if (!ctx) return;
  if (ctx.state !== 'running') {
    // resume() is asynchronous. Bailing here without retrying is what left the
    // bed silent after a phone call or a trip to the background.
    void ctx
      .resume()
      .then(() => {
        if (musicEnabled && ambientTimer === null) scheduleNextAmbientNote();
      })
      .catch(() => undefined);
    return;
  }

  render(ctx, ambientNote(ambientIndex), ctx.currentTime + 0.05);
  ambientIndex += 1;

  ambientTimer = window.setTimeout(() => {
    ambientTimer = null;
    scheduleNextAmbientNote();
  }, AMBIENT_INTERVAL_SECONDS * 1000);
}

function startAmbientMusic(): void {
  if (!musicEnabled || ambientTimer !== null) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  scheduleNextAmbientNote();
}

/**
 * Bring audio back after the platform took it away.
 *
 * Called when the app returns to the foreground. On iOS a phone call, an alarm
 * or Siri suspends the WebAudio context; the native side reactivates the
 * AVAudioSession and this reattaches the web side to it. Safe to call often.
 */
export function resumeAudio(): void {
  const ctx = audioContext();
  if (!ctx) return;
  if (ctx.state !== 'running') {
    void ctx.resume().then(() => startAmbientMusic()).catch(() => undefined);
    return;
  }
  startAmbientMusic();
}

export function setAmbientMusicEnabled(enabled: boolean): void {
  musicEnabled = enabled;
  if (!enabled) {
    stopAmbientMusic();
    return;
  }
  if (!gestureListenerInstalled && typeof window !== 'undefined') {
    gestureListenerInstalled = true;
    const unlock = () => startAmbientMusic();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') stopAmbientMusic();
      else startAmbientMusic();
    });
  }
  startAmbientMusic();
}
