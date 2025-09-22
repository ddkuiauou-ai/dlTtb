const DEFAULT_SEED_INTERVAL_MS = 120_000;

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickRandom<T>(arr: T[], k: number, seed: number) {
  const a = arr.slice();
  const rand = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(k, a.length));
}

export interface ServerClampOptions {
  sampleMax: number;
  randomizeOnEachMount?: boolean;
  seedIntervalMs?: number;
  seed?: number;
}

export interface ServerClampResult<T> {
  sampled: T[];
  seed: number;
}

export function sampleForClamp<T>(items: T[], options: ServerClampOptions): ServerClampResult<T> {
  const { sampleMax, randomizeOnEachMount = false, seedIntervalMs = DEFAULT_SEED_INTERVAL_MS, seed } = options;

  if (!Array.isArray(items) || items.length === 0 || sampleMax <= 0) {
    return { sampled: [], seed: seed ?? 0 };
  }

  const effectiveSeed =
    seed ?? (randomizeOnEachMount ? Math.floor(Math.random() * 1e9) : Math.floor(Date.now() / seedIntervalMs));

  const sampled = pickRandom(items, sampleMax, effectiveSeed);

  return { sampled, seed: effectiveSeed };
}
