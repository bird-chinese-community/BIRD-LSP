import { createContext, type FormatterContext } from "@dprint/formatter";
import { getBuffer as getBirdPluginBuffer } from "@birdcc/dprint-plugin-bird";

import { assertSafeModeSemanticEquivalence } from "./semantic.js";
import type { BirdFormatResult, ResolvedFormatOptions } from "./types.js";

const MAX_DPRINT_CONTEXT_CACHE_SIZE = 16;

const dprintContextCache = new Map<string, FormatterContext>();
const dprintContextCacheAccessOrder: string[] = [];
let birdPluginBufferCache: Uint8Array | undefined;

const getBirdPluginBufferCached = (): Uint8Array => {
  if (!birdPluginBufferCache) {
    birdPluginBufferCache = getBirdPluginBuffer();
  }
  return birdPluginBufferCache;
};

const contextCacheKey = (options: ResolvedFormatOptions): string =>
  `${options.indentSize}:${options.lineWidth}:${options.safeMode ? "1" : "0"}`;

const touchContextCacheKey = (key: string): void => {
  const existingIndex = dprintContextCacheAccessOrder.indexOf(key);
  if (existingIndex >= 0) {
    dprintContextCacheAccessOrder.splice(existingIndex, 1);
  }
  dprintContextCacheAccessOrder.push(key);
};

const evictOldestContextIfNeeded = (): void => {
  if (dprintContextCache.size < MAX_DPRINT_CONTEXT_CACHE_SIZE) {
    return;
  }

  const oldestKey = dprintContextCacheAccessOrder.shift();
  if (!oldestKey) {
    return;
  }

  dprintContextCache.delete(oldestKey);
};

const getOrCreateDprintContext = (options: ResolvedFormatOptions): FormatterContext => {
  const key = contextCacheKey(options);
  const cached = dprintContextCache.get(key);
  if (cached) {
    touchContextCacheKey(key);
    return cached;
  }

  evictOldestContextIfNeeded();

  const context = createContext({
    indentWidth: options.indentSize,
    lineWidth: options.lineWidth,
  });
  context.addPlugin(getBirdPluginBufferCached(), {
    lineWidth: options.lineWidth,
    indentWidth: options.indentSize,
    safeMode: options.safeMode,
  });

  dprintContextCache.set(key, context);
  touchContextCacheKey(key);
  return context;
};

export const formatWithEmbeddedDprint = async (
  text: string,
  options: ResolvedFormatOptions,
): Promise<BirdFormatResult> => {
  const context = getOrCreateDprintContext(options);
  const formattedText = context.formatText({
    filePath: "bird.conf",
    fileText: text,
  });

  if (options.safeMode && formattedText !== text) {
    await assertSafeModeSemanticEquivalence(text, formattedText);
  }

  return {
    text: formattedText,
    changed: formattedText !== text,
    engine: "dprint",
  };
};

export const resetDprintStateForTest = (): void => {
  dprintContextCache.clear();
  dprintContextCacheAccessOrder.length = 0;
  birdPluginBufferCache = undefined;
};
