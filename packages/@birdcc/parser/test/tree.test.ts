import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cacheUtf8BytesForTests,
  getUtf8CacheStateForTests,
  resetUtf8CacheForTests,
  toRange,
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
    expect(firstState.utf8Version).toBe(1);
    expect(secondState.utf8Version).toBe(1);
  });

  it("rebuilds cache after ttl expires", () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(2_000);

    cacheUtf8BytesForTests("protocol bgp edge {}");
    const firstState = getUtf8CacheStateForTests();

    nowSpy.mockReturnValue(2_000 + 31_000);
    cacheUtf8BytesForTests("protocol bgp edge {}");
    const secondState = getUtf8CacheStateForTests();

    expect(firstState.utf8Version).toBe(1);
    expect(secondState.utf8Version).toBe(2);
  });

  it("reuses line start cache and rebuilds after ttl expires", () => {
    const node = {
      startIndex: 0,
      endIndex: 8,
      text: "protocol",
      startPosition: { row: 0, column: 0 },
      endPosition: { row: 0, column: 8 },
    };
    const source = "protocol\\nbgp edge";
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(3_000);

    toRange(node as never, source);
    const firstState = getUtf8CacheStateForTests();

    nowSpy.mockReturnValue(3_500);
    toRange(node as never, source);
    const secondState = getUtf8CacheStateForTests();

    nowSpy.mockReturnValue(3_000 + 31_000);
    toRange(node as never, source);
    const thirdState = getUtf8CacheStateForTests();

    expect(firstState.lineStartsVersion).toBe(1);
    expect(secondState.lineStartsVersion).toBe(1);
    expect(thirdState.lineStartsVersion).toBe(2);
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
