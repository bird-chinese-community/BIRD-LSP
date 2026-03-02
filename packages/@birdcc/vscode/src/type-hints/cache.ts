export interface TypeHintCacheOptions {
  readonly maxEntries: number;
  readonly ttlMs: number;
  readonly now?: () => number;
}

interface CacheEntry<TValue> {
  readonly version: number;
  readonly hints: readonly TValue[];
  readonly cachedAt: number;
}

export interface TypeHintCache<TValue> {
  readonly size: number;
  get: (key: string, version: number) => readonly TValue[] | undefined;
  set: (key: string, version: number, hints: readonly TValue[]) => void;
  delete: (key: string) => void;
  clear: () => void;
}

const isPositiveInteger = (value: number): boolean =>
  Number.isInteger(value) && value > 0;

export const createTypeHintCache = <TValue>(
  options: TypeHintCacheOptions,
): TypeHintCache<TValue> => {
  const maxEntries = isPositiveInteger(options.maxEntries)
    ? options.maxEntries
    : 1;
  const ttlMs = isPositiveInteger(options.ttlMs) ? options.ttlMs : 1;
  const now = options.now ?? Date.now;
  const entries = new Map<string, CacheEntry<TValue>>();

  const isExpired = (entry: CacheEntry<TValue>, currentTime: number): boolean =>
    currentTime - entry.cachedAt >= ttlMs;

  const touch = (key: string, entry: CacheEntry<TValue>): void => {
    entries.delete(key);
    entries.set(key, entry);
  };

  const evictOverflow = (): void => {
    while (entries.size > maxEntries) {
      const oldestKey = entries.keys().next().value as string | undefined;
      if (!oldestKey) {
        return;
      }
      entries.delete(oldestKey);
    }
  };

  return {
    get size() {
      return entries.size;
    },
    get: (key: string, version: number): readonly TValue[] | undefined => {
      const entry = entries.get(key);
      if (!entry) {
        return undefined;
      }

      const currentTime = now();
      if (isExpired(entry, currentTime)) {
        entries.delete(key);
        return undefined;
      }

      if (entry.version !== version) {
        return undefined;
      }

      touch(key, {
        ...entry,
        cachedAt: currentTime,
      });
      return entry.hints;
    },
    set: (key: string, version: number, hints: readonly TValue[]): void => {
      touch(key, {
        version,
        hints,
        cachedAt: now(),
      });
      evictOverflow();
    },
    delete: (key: string): void => {
      entries.delete(key);
    },
    clear: (): void => {
      entries.clear();
    },
  };
};
