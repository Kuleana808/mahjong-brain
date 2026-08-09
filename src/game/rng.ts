/**
 * Deterministic, seedable PRNG.
 *
 * Deals must be reproducible: a seed is stored with every board so a session
 * can be restored offline (no server round-trip) and so tests are stable.
 * mulberry32 — 32-bit state, good enough distribution for shuffling, ~10 lines.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, n). */
  int(n: number): number;
  /** Uniformly picks one element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** Fisher–Yates, returns a new array. */
  shuffle<T>(items: readonly T[]): T[];
  readonly seed: number;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (n: number): number => Math.floor(next() * n);

  return {
    seed,
    next,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('rng.pick: empty array');
      return items[int(items.length)];
    },
    shuffle<T>(items: readonly T[]): T[] {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

/** A fresh seed for a new board. Not cryptographic — it only shuffles tiles. */
export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}
