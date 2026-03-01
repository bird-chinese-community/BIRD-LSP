import type { Node as SyntaxNode } from "web-tree-sitter";
import type { SourceRange } from "./types.js";

export const toRange = (node: SyntaxNode): SourceRange => ({
  line: node.startPosition.row + 1,
  column: node.startPosition.column + 1,
  endLine: node.endPosition.row + 1,
  endColumn: node.endPosition.column + 1,
});

export const mergeRanges = (start: SourceRange, end: SourceRange): SourceRange => ({
  line: start.line,
  column: start.column,
  endLine: end.endLine,
  endColumn: end.endColumn,
});

export const textOf = (node: SyntaxNode, source: string): string =>
  source.slice(node.startIndex, node.endIndex);

export const stripQuotes = (value: string): string => value.replace(/^['"]|['"]$/g, "");

export const isPresentNode = (node: SyntaxNode | null): node is SyntaxNode =>
  Boolean(node && !node.isMissing && !node.isError);
