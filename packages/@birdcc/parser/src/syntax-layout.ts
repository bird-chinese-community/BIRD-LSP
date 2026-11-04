import type { Node as SyntaxNode } from "web-tree-sitter";
import { toRange } from "./tree.js";
import type { SourceRange } from "./types.js";

export interface BirdSyntaxLayout {
  structuralTokens: Array<SourceRange & { opening: boolean }>;
  preservedLines: Set<number>;
  commentColumns: Map<number, number>;
}

/** Collect layout boundaries from the grammar, keeping token contents intact. */
export const collectBirdSyntaxLayout = (
  rootNode: SyntaxNode,
  source: string,
): BirdSyntaxLayout => {
  const layout: BirdSyntaxLayout = {
    structuralTokens: [],
    preservedLines: new Set(),
    commentColumns: new Map(),
  };
  const stack = [rootNode];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) break;
    if (["{", "}", "[", "]"].includes(node.type)) {
      layout.structuralTokens.push({
        ...toRange(node, source),
        opening: node.type === "{" || node.type === "[",
      });
    }
    if (node.type === "comment") {
      const range = toRange(node, source);
      if (!layout.commentColumns.has(range.line)) {
        layout.commentColumns.set(range.line, range.column);
      }
    }
    if (
      node.type === "comment" &&
      node.startPosition.row !== node.endPosition.row
    ) {
      for (
        let line = node.startPosition.row + 1;
        line <= node.endPosition.row + 1;
        line += 1
      ) {
        layout.preservedLines.add(line);
      }
    }
    for (let index = node.childCount - 1; index >= 0; index -= 1) {
      const child = node.child(index);
      if (child) stack.push(child);
    }
  }
  return layout;
};
