import type { Node as SyntaxNode } from "web-tree-sitter";
import type { ParseIssue } from "./types.js";
import { toRange } from "./tree.js";

export const collectTreeIssues = (rootNode: SyntaxNode, issues: ParseIssue[]): void => {
  if (!rootNode.hasError) {
    return;
  }

  const stack: SyntaxNode[] = [rootNode];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    if (current.isError) {
      const snippet = current.text.replace(/\s+/g, " ").trim();
      issues.push({
        code: "parser/syntax-error",
        message: `Syntax error near '${snippet || current.type}'`,
        ...toRange(current),
      });
    }

    if (current.isMissing) {
      const code = current.type === "}" ? "parser/unbalanced-brace" : "parser/missing-symbol";
      const message =
        current.type === "}" ? "Missing '}' to close block" : `Missing symbol '${current.type}'`;

      issues.push({
        code,
        message,
        ...toRange(current),
      });
    }

    for (const child of current.children) {
      stack.push(child);
    }
  }
};

export const pushMissingFieldIssue = (
  issues: ParseIssue[],
  declarationNode: SyntaxNode,
  message: string,
): void => {
  issues.push({
    code: "parser/missing-symbol",
    message,
    ...toRange(declarationNode),
  });
};

export const dedupeIssues = (issues: ParseIssue[]): ParseIssue[] => {
  const seen = new Set<string>();
  const unique: ParseIssue[] = [];

  for (const issue of issues) {
    const key = `${issue.code}:${issue.message}:${issue.line}:${issue.column}:${issue.endLine}:${issue.endColumn}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(issue);
  }

  return unique;
};

export const parseFailureIssue = (): ParseIssue => ({
  code: "parser/syntax-error",
  message: "Failed to parse input",
  line: 1,
  column: 1,
  endLine: 1,
  endColumn: 1,
});
