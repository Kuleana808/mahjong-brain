/**
 * Original, synthesized game sounds.
 *
 * The short envelopes make the feedback feel like ceramic and wood without
 * shipping borrowed samples or turning a calm game into a slot machine. Audio
 * is created lazily from the player's first gesture and every failure is a
 * silent no-op, so sound can never block gameplay.
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
  | 'holder-full';

let context: AudioContext | null = null;
let musicEnabled = false;
let musicNodes: { oscillators: OscillatorNode[]; gain: GainNode } | null = null;
let gestureListenerInstalled = false;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return null;
  context ??= new AudioContextClass();
  if (context.state === 'suspended') void context.resume();
  return context;
}

function stopAmbientMusic(): void {
  if (!musicNodes) return;
  const active = musicNodes;
  musicNodes = null;
  const now = context?.currentTime ?? 0;
  active.gain.gain.cancelScheduledValues(now);
  active.gain.gain.setTargetAtTime(0.0001, now, 0.18);
  window.setTimeout(() => active.oscillators.forEach((oscillator) => oscillator.stop()), 900);
}

function startAmbientMusic(): void {
  if (!musicEnabled || musicNodes || document.visibilityState === 'hidden') return;
  const ctx = audioContext();
  if (!ctx || ctx.state !== 'running') return;

  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 920;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.012, ctx.currentTime + 1.8);
  gain.connect(filter).connect(ctx.destination);

  const oscillators = [146.83, 220, 293.66].map((frequency, index) => {
    const oscillator = ctx.createOscillator();
    oscillator.type = index === 1 ? 'triangle' : 'sine';
    oscillator.frequency.value = frequency;
    oscillator.detune.value = index === 2 ? -7 : index === 0 ? 4 : 0;
    oscillator.connect(gain);
    oscillator.start();
    return oscillator;
  });
  musicNodes = { oscillators, gain };
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

function tone(
  ctx: AudioContext,
  frequency: number,
  at: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.02);
}

function ceramicTap(ctx: AudioContext, at: number, pitch = 1): void {
  tone(ctx, 1260 * pitch, at, 0.055, 0.025, 'triangle');
  tone(ctx, 690 * pitch, at + 0.004, 0.085, 0.018, 'sine');
}

function softRattle(ctx: AudioContext, at: number): void {
  for (let index = 0; index < 5; index += 1) {
    ceramicTap(ctx, at + index * 0.035, 0.78 + index * 0.055);
  }
}
export function playSound(sound: GameSound, enabled = true): void {
  if (!enabled) return;
  try {
    const ctx = audioContext();
    if (!ctx) return;
    const now = ctx.currentTime + 0.004;

    switch (sound) {
      case 'tile':
        ceramicTap(ctx, now);
        break;
      case 'blocked':
        tone(ctx, 310, now, 0.07, 0.018, 'triangle');
        break;
      case 'match':
        ceramicTap(ctx, now, 1.04);
        tone(ctx, 880, now + 0.055, 0.16, 0.028, 'sine');
        tone(ctx, 1175, now + 0.09, 0.2, 0.022, 'sine');
        break;
      case 'holder-warning':
        tone(ctx, 523, now, 0.14, 0.022, 'sine');
        tone(ctx, 659, now + 0.1, 0.18, 0.02, 'sine');
        break;
      case 'shuffle':
        softRattle(ctx, now);
        break;
      case 'undo':
        tone(ctx, 740, now, 0.08, 0.02, 'triangle');
        tone(ctx, 554, now + 0.055, 0.12, 0.018, 'triangle');
        break;
      case 'hint':
        tone(ctx, 659, now, 0.12, 0.018, 'sine');
        tone(ctx, 988, now + 0.075, 0.19, 0.018, 'sine');
        break;
      case 'win':
        tone(ctx, 523, now, 0.24, 0.024, 'sine');
        tone(ctx, 659, now + 0.1, 0.28, 0.025, 'sine');
        tone(ctx, 784, now + 0.2, 0.38, 0.028, 'sine');
        break;
      case 'holder-full':
        tone(ctx, 392, now, 0.18, 0.022, 'triangle');
        tone(ctx, 330, now + 0.11, 0.24, 0.02, 'triangle');
        break;
    }
  } catch {
    // Audio availability and permissions never affect the play loop.
  }
}
