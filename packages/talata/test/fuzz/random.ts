export interface Random {
  next: () => number;
  int: (limit: number) => number;
  chance: (probability: number) => boolean;
  pick: <T>(items: readonly T[]) => T;
}

/** A small seeded generator (mulberry32), so every document can be rebuilt from its seed. */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (limit) => Math.floor(next() * limit),
    chance: (probability) => next() < probability,
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}

/** Mixes the run seed with a document index. */
export function documentSeed(seed: number, index: number): number {
  let h = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** FNV-1a, used to name fixtures. */
export function hashText(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h = Math.imul(h ^ value.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
