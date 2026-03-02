import type { Node as SyntaxNode } from "web-tree-sitter";
import type { SourceRange } from "./types.js";

const byteOffsetToCodeUnitIndex = (
  bytes: Buffer,
  byteOffset: number,
): number => {
  const clampedOffset = Math.max(0, Math.min(byteOffset, bytes.length));
  return bytes.subarray(0, clampedOffset).toString("utf8").length;
};

let cachedSourceForBytes: string | null = null;
let cachedUtf8Bytes: Buffer | null = null;
let cachedSourceForLineStarts: string | null = null;
let cachedLineStarts: number[] | null = null;
const UTF8_CACHE_LIMIT_BYTES = 4 * 1024 * 1024;
const UTF8_CACHE_TTL_MS = 30_000;
let cachedUtf8BytesUpdatedAt = 0;
let cachedUtf8BytesVersion = 0;
let cachedLineStartsUpdatedAt = 0;
let cachedLineStartsVersion = 0;

const clearTextCaches = (): void => {
  cachedSourceForBytes = null;
  cachedUtf8Bytes = null;
  cachedSourceForLineStarts = null;
  cachedLineStarts = null;
  cachedUtf8BytesUpdatedAt = 0;
  cachedLineStartsUpdatedAt = 0;
};

const isUtf8CacheExpired = (): boolean => {
  if (!cachedUtf8Bytes || cachedUtf8BytesUpdatedAt === 0) {
    return true;
  }

  return Date.now() - cachedUtf8BytesUpdatedAt > UTF8_CACHE_TTL_MS;
};

const utf8BytesOf = (source: string): Buffer => {
  const estimatedBytes = Buffer.byteLength(source, "utf8");
  if (estimatedBytes > UTF8_CACHE_LIMIT_BYTES) {
    if (
      cachedUtf8Bytes &&
      cachedUtf8Bytes.length > UTF8_CACHE_LIMIT_BYTES / 2
    ) {
      clearTextCaches();
    }
    return Buffer.from(source, "utf8");
  }

  if (
    cachedSourceForBytes !== source ||
    !cachedUtf8Bytes ||
    isUtf8CacheExpired()
  ) {
    cachedSourceForBytes = source;
    cachedUtf8Bytes = Buffer.from(source, "utf8");
    cachedUtf8BytesVersion += 1;
  }
  cachedUtf8BytesUpdatedAt = Date.now();

  return cachedUtf8Bytes;
};

const nodeCodeUnitSpan = (
  node: SyntaxNode,
  source: string,
): {
  startIndex: number;
  endIndex: number;
} => {
  const startIndex = node.startIndex;
  const endIndex = node.endIndex;

  const inBounds =
    startIndex >= 0 && endIndex >= startIndex && endIndex <= source.length;
  if (inBounds && source.slice(startIndex, endIndex) === node.text) {
    return { startIndex, endIndex };
  }

  const bytes = utf8BytesOf(source);
  return {
    startIndex: byteOffsetToCodeUnitIndex(bytes, startIndex),
    endIndex: byteOffsetToCodeUnitIndex(bytes, endIndex),
  };
};

const lineStartsOf = (source: string): number[] => {
  const estimatedBytes = Buffer.byteLength(source, "utf8");
  const canUseCache = estimatedBytes <= UTF8_CACHE_LIMIT_BYTES;
  if (
    canUseCache &&
    cachedSourceForLineStarts === source &&
    cachedLineStarts &&
    Date.now() - cachedLineStartsUpdatedAt <= UTF8_CACHE_TTL_MS
  ) {
    cachedLineStartsUpdatedAt = Date.now();
    return cachedLineStarts;
  }

  const starts = [0];

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") {
      starts.push(index + 1);
    }
  }

  if (canUseCache) {
    cachedSourceForLineStarts = source;
    cachedLineStarts = starts;
    cachedLineStartsUpdatedAt = Date.now();
    cachedLineStartsVersion += 1;
  }

  return starts;
};

const indexToLineColumn = (
  codeUnitIndex: number,
  lineStarts: number[],
): { line: number; column: number } => {
  let low = 0;
  let high = lineStarts.length - 1;
  let bestLineIndex = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const lineStart = lineStarts[middle] ?? 0;

    if (lineStart <= codeUnitIndex) {
      bestLineIndex = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  const lineStart = lineStarts[bestLineIndex] ?? 0;
  return {
    line: bestLineIndex + 1,
    column: codeUnitIndex - lineStart + 1,
  };
};

export const toRange = (node: SyntaxNode, source?: string): SourceRange => {
  if (!source) {
    return {
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      endLine: node.endPosition.row + 1,
      endColumn: node.endPosition.column + 1,
    };
  }

  const { startIndex, endIndex } = nodeCodeUnitSpan(node, source);
  const lineStarts = lineStartsOf(source);
  const start = indexToLineColumn(startIndex, lineStarts);
  const end = indexToLineColumn(endIndex, lineStarts);

  return {
    line: start.line,
    column: start.column,
    endLine: end.line,
    endColumn: end.column,
  };
};

export const mergeRanges = (
  start: SourceRange,
  end: SourceRange,
): SourceRange => ({
  line: start.line,
  column: start.column,
  endLine: end.endLine,
  endColumn: end.endColumn,
});

export const textOf = (node: SyntaxNode, source: string): string => {
  const { startIndex, endIndex } = nodeCodeUnitSpan(node, source);
  return source.slice(startIndex, endIndex);
};

export const stripQuotes = (value: string): string =>
  value.replace(/^['"]|['"]$/g, "");

export const isPresentNode = (node: SyntaxNode | null): node is SyntaxNode =>
  Boolean(node && !node.isMissing && !node.isError);

export const cacheUtf8BytesForTests = (source: string): number =>
  utf8BytesOf(source).length;

export const getUtf8CacheStateForTests = (): {
  hasCache: boolean;
  byteLength: number;
  utf8Version: number;
  lineStartsVersion: number;
} => ({
  hasCache: Boolean(cachedUtf8Bytes),
  byteLength: cachedUtf8Bytes?.length ?? 0,
  utf8Version: cachedUtf8BytesVersion,
  lineStartsVersion: cachedLineStartsVersion,
});

export const resetUtf8CacheForTests = (): void => {
  clearTextCaches();
  cachedUtf8BytesVersion = 0;
  cachedLineStartsVersion = 0;
};
