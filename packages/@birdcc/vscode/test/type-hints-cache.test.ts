import { describe, expect, it, vi } from "vitest";

import { createTypeHintCache } from "../src/type-hints/cache.js";

describe("type-hints cache", () => {
  it("returns cached hints only when version matches", () => {
    const cache = createTypeHintCache<string>({
      maxEntries: 2,
      ttlMs: 60_000,
    });

    cache.set("file:///a.conf", 1, ["hint-a"]);

    expect(cache.get("file:///a.conf", 1)).toEqual(["hint-a"]);
    expect(cache.get("file:///a.conf", 2)).toBeUndefined();
  });

  it("evicts the least recently used entry when max size is exceeded", () => {
    const now = vi.fn(() => 0);
    const cache = createTypeHintCache<string>({
      maxEntries: 2,
      ttlMs: 60_000,
      now,
    });

    cache.set("a", 1, ["hint-a"]);
    cache.set("b", 1, ["hint-b"]);
    expect(cache.get("a", 1)).toEqual(["hint-a"]);
    cache.set("c", 1, ["hint-c"]);

    expect(cache.get("a", 1)).toEqual(["hint-a"]);
    expect(cache.get("b", 1)).toBeUndefined();
    expect(cache.get("c", 1)).toEqual(["hint-c"]);
  });

  it("expires stale entries by ttl", () => {
    let currentTime = 0;
    const cache = createTypeHintCache<string>({
      maxEntries: 10,
      ttlMs: 1_000,
      now: () => currentTime,
    });

    cache.set("file:///a.conf", 1, ["hint-a"]);
    currentTime = 999;
    expect(cache.get("file:///a.conf", 1)).toEqual(["hint-a"]);

    currentTime = 2_000;
    expect(cache.get("file:///a.conf", 1)).toBeUndefined();
    expect(cache.size).toBe(0);
  });
});
