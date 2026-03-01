import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cacheUtf8BytesForTests,
  getUtf8CacheStateForTests,
  resetUtf8CacheForTests,
} from "../src/tree.js";

describe("@birdcc/parser utf8 cache", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetUtf8CacheForTests();
  });

  it("reuses cache for the same source within ttl window", () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(1_000);

    cacheUtf8BytesForTests("protocol bgp edge {}");
    const firstState = getUtf8CacheStateForTests();

    nowSpy.mockReturnValue(1_500);
    cacheUtf8BytesForTests("protocol bgp edge {}");
    const secondState = getUtf8CacheStateForTests();

    expect(firstState.hasCache).toBe(true);
    expect(firstState.version).toBe(1);
    expect(secondState.version).toBe(1);
  });

  it("rebuilds cache after ttl expires", () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(2_000);

    cacheUtf8BytesForTests("protocol bgp edge {}");
    const firstState = getUtf8CacheStateForTests();

    nowSpy.mockReturnValue(2_000 + 31_000);
    cacheUtf8BytesForTests("protocol bgp edge {}");
    const secondState = getUtf8CacheStateForTests();

    expect(firstState.version).toBe(1);
    expect(secondState.version).toBe(2);
  });

  it("does not store oversized source into cache", () => {
    const largeSource = "a".repeat(4 * 1024 * 1024 + 64);
    const byteLength = cacheUtf8BytesForTests(largeSource);
    const state = getUtf8CacheStateForTests();

    expect(byteLength).toBeGreaterThan(4 * 1024 * 1024);
    expect(state.hasCache).toBe(false);
    expect(state.byteLength).toBe(0);
  });
});
