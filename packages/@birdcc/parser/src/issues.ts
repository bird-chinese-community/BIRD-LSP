import type { Node as SyntaxNode } from "web-tree-sitter";
import type { ParseIssue, SourceRange } from "./types.js";
import { toRange } from "./tree.js";

export const collectTreeIssues = (
  rootNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): void => {
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
        ...toRange(current, source),
      });
    }

    if (current.isMissing) {
      const code =
        current.type === "}"
          ? "syntax/unbalanced-brace"
          : current.type === ";"
            ? "syntax/missing-semicolon"
            : "parser/missing-symbol";
      const message =
        current.type === "}"
          ? "Missing '}' to close block"
          : current.type === ";"
            ? "Missing ';' at end of statement"
            : `Missing symbol '${current.type}'`;

      issues.push({
        code,
        message,
        ...toRange(current, source),
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
  source: string,
  options: {
    range?: SourceRange;
  } = {},
): void => {
  const range = options.range ?? toRange(declarationNode, source);
  issues.push({
    code: "parser/missing-symbol",
    message,
    ...range,
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

export const ensureBraceBalanceIssue = (
  source: string,
  issues: ParseIssue[],
): void => {
  let balance = 0;
  let line = 1;
  let column = 1;
  let endLine = 1;
  let endColumn = 1;

  for (const char of source) {
    if (char === "{") {
      balance += 1;
      endLine = line;
      endColumn = column;
    } else if (char === "}") {
      balance -= 1;
      endLine = line;
      endColumn = column;
    }

    if (char === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }

  if (balance <= 0) {
    return;
  }

  const alreadyHasUnbalanced = issues.some(
    (item) => item.code === "syntax/unbalanced-brace",
  );
  if (alreadyHasUnbalanced) {
    return;
  }

  issues.push({
    code: "syntax/unbalanced-brace",
    message: "Missing '}' to close block",
    line: endLine,
    column: endColumn,
    endLine,
    endColumn,
  });
};

export const parseFailureIssue = (): ParseIssue => ({
  code: "parser/syntax-error",
  message: "Failed to parse input",
  line: 1,
  column: 1,
  endLine: 1,
  endColumn: 1,
});

export const runtimeFailureIssue = (error: unknown): ParseIssue => ({
  code: "parser/runtime-error",
  message: `Parser runtime unavailable: ${error instanceof Error ? error.message : String(error)}`,
  line: 1,
  column: 1,
  endLine: 1,
  endColumn: 1,
});

const TYPE_DECLARATION_LINE =
  /^\s*(?:int|bool|string|ip|prefix|pair|quad|ec|lc|bgppath|clist|eclist|lclist)\s+[A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*\s*;\s*$/i;
const FUNCTION_PARAM_WITH_SEMICOLON =
  /^\s*function\b[^{]*\([^)]*;[^)]*\)\s*[{]?\s*$/i;
const LOCAL_ADDRESS_WITH_AS =
  /^\s*local\s+\S+(?:\s+port\s+\S+)?\s+as\s+\S+\s*;\s*$/i;
const RPKI_LOCAL_ADDRESS = /^\s*local\s+address\s+\S+\s*;\s*$/i;
const ALLOW_LOCAL_AS = /^\s*allow\s+local\s+as\s*;\s*$/i;
const BFD_ACCEPT = /^\s*accept(?:\s+(?:ipv4|ipv6|direct|multihop))*\s*;\s*$/i;
const BFD_NEIGHBOR =
  /^\s*neighbor\s+\S+(?:\s+(?:%\s+\S+|dev\s+(?:"[^"]+"|'[^']+'|\S+)|local\s+\S+|multihop(?:\s+\S+)?))*\s*;?\s*$/i;
const BFD_PROFILE_HEADER = /^\s*(?:interface\b.+|multihop\s*)\{\s*$/i;
const BFD_PROFILE_ITEM =
  /^\s*(?:interval|min\s+rx\s+interval|min\s+tx\s+interval|idle\s+tx\s+interval|multiplier|passive|authentication|password|graceful)\b.*;\s*$/i;
const CASE_ARM_STATEMENT = /^\s*[A-Za-z_][A-Za-z0-9_]*\s*:\s*.+$/;
const IPV6_SADR_TABLE_DECLARATION =
  /^\s*ipv6\s+sadr\s+table\s+[A-Za-z_][A-Za-z0-9_-]*(?:\s+.*)?;\s*$/i;
const MPLS_DOMAIN_HEADER =
  /^\s*mpls\s+domain\s+[A-Za-z_][A-Za-z0-9_-]*\s*\{?\s*$/i;
const MPLS_DOMAIN_BLOCK_END = /^\s*}\s*;?\s*$/;
const COMPOUND_CHANNEL_PHRASE =
  /\b(?:ipv6\s+sadr|ipv4\s+mpls|ipv6\s+mpls|vpn4\s+mpls|vpn6\s+mpls)\s*\{/i;
const BITWISE_FILTER_TERM = /\bbt_assert\s*\([^)]*\s[&|]\s[^)]*\)\s*;/i;
const BGP_DISABLE_AFTER_CEASE_HEADER = /^\s*disable\s+after\s+cease\s*\{/iu;
const BLOCK_END = /^\s*\}\s*;?/u;
const BGP_CEASE_FLAG_LINE =
  /^\s*(?:cease|prefix\s+limit\s+hit|administrative\s+shutdown|peer\s+deconfigured|administrative\s+reset|connection\s+rejected|configuration\s+change|connection\s+collision|out\s+of\s+resources)\s*,?/iu;

const linesOf = (source: string): string[] => source.split(/\r?\n/);

const lineTextAt = (lines: string[], line: number): string =>
  lines[line - 1] ?? "";

const isTypedDeclarationRange = (
  issue: ParseIssue,
  lines: string[],
): boolean => {
  if (issue.endLine < issue.line) {
    return false;
  }

  for (let line = issue.line; line <= issue.endLine; line += 1) {
    if (!TYPE_DECLARATION_LINE.test(lineTextAt(lines, line))) {
      return false;
    }
  }

  return true;
};

const isMplsDomainBlockEndIssue = (
  issue: ParseIssue,
  lines: string[],
): boolean => {
  if (!MPLS_DOMAIN_BLOCK_END.test(lineTextAt(lines, issue.line))) {
    return false;
  }

  let balance = 0;
  for (let line = issue.line; line >= 1; line -= 1) {
    const text = lineTextAt(lines, line);
    balance += (text.match(/}/g) ?? []).length;
    balance -= (text.match(/{/g) ?? []).length;

    if (MPLS_DOMAIN_HEADER.test(text)) {
      return balance <= 0;
    }
  }

  return false;
};

const isBgpDisableAfterCeaseFlagSetIssue = (
  issue: ParseIssue,
  lines: string[],
): boolean => {
  if (!BGP_CEASE_FLAG_LINE.test(lineTextAt(lines, issue.line))) {
    return false;
  }

  for (let line = issue.line - 1; line >= 1; line -= 1) {
    const text = lineTextAt(lines, line);
    if (BGP_DISABLE_AFTER_CEASE_HEADER.test(text)) {
      return true;
    }

    if (BLOCK_END.test(text)) {
      return false;
    }
  }

  return false;
};

const isRecoverableSyntaxIssue = (
  issue: ParseIssue,
  lines: string[],
): boolean => {
  if (issue.code === "syntax/missing-semicolon") {
    return (
      CASE_ARM_STATEMENT.test(lineTextAt(lines, issue.line)) ||
      isMplsDomainBlockEndIssue(issue, lines) ||
      isBgpDisableAfterCeaseFlagSetIssue(issue, lines) ||
      BFD_NEIGHBOR.test(lineTextAt(lines, issue.line))
    );
  }

  if (
    issue.code === "parser/missing-symbol" &&
    issue.message === "Missing symbol ')'" &&
    BITWISE_FILTER_TERM.test(lineTextAt(lines, issue.line))
  ) {
    return true;
  }

  if (issue.code !== "parser/syntax-error") {
    return false;
  }

  const currentLineText = lineTextAt(lines, issue.line);
  if (
    LOCAL_ADDRESS_WITH_AS.test(currentLineText) ||
    RPKI_LOCAL_ADDRESS.test(currentLineText) ||
    ALLOW_LOCAL_AS.test(currentLineText) ||
    BFD_ACCEPT.test(currentLineText) ||
    BFD_NEIGHBOR.test(currentLineText) ||
    BFD_PROFILE_HEADER.test(currentLineText) ||
    BFD_PROFILE_ITEM.test(currentLineText) ||
    IPV6_SADR_TABLE_DECLARATION.test(currentLineText) ||
    COMPOUND_CHANNEL_PHRASE.test(issue.message)
  ) {
    return true;
  }

  if (
    issue.message.includes("';'") &&
    FUNCTION_PARAM_WITH_SEMICOLON.test(currentLineText)
  ) {
    return true;
  }

  if (isTypedDeclarationRange(issue, lines)) {
    return true;
  }

  return false;
};

export const suppressRecoverableSyntaxIssues = (
  issues: ParseIssue[],
  source: string,
): ParseIssue[] => {
  const lines = linesOf(source);
  return issues.filter((issue) => !isRecoverableSyntaxIssue(issue, lines));
};
