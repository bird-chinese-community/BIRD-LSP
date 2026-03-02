import type { Node as SyntaxNode } from "web-tree-sitter";
import type { FilterBodyStatement, ParseIssue } from "../types.js";
import { pushMissingFieldIssue } from "../issues.js";
import { isPresentNode, mergeRanges, textOf, toRange } from "../tree.js";
import {
  type ExtractedLiteral,
  type FilterDeclaration,
  type FunctionDeclaration,
  type MatchExpression,
  isStrictIpLiteral,
} from "./shared.js";

const parseControlStatements = (
  bodyNode: SyntaxNode,
  source: string,
): FilterBodyStatement[] => {
  const statements: FilterBodyStatement[] = [];
  const bodyRange = toRange(bodyNode, source);
  const bodyText = textOf(bodyNode, source);
  const tokenTexts = bodyNode.namedChildren.map((node) =>
    textOf(node, source).toLowerCase(),
  );

  for (const statementNode of bodyNode.namedChildren) {
    const statementRange = toRange(statementNode, source);
    const text = textOf(statementNode, source).trim();
    const lowered = text.toLowerCase();

    if (statementNode.type === "if_statement" || lowered === "if") {
      const thenIndex = lowered.indexOf(" then ");
      const conditionText =
        lowered.startsWith("if ") && thenIndex > 0
          ? text.slice(3, thenIndex).trim()
          : undefined;

      statements.push({
        kind: "if",
        conditionText,
        thenText: "",
        ...statementRange,
      });
      continue;
    }

    if (statementNode.type === "accept_statement" || lowered === "accept") {
      statements.push({
        kind: "accept",
        ...statementRange,
      });
      continue;
    }

    if (statementNode.type === "reject_statement" || lowered === "reject") {
      statements.push({
        kind: "reject",
        ...statementRange,
      });
      continue;
    }

    if (statementNode.type === "return_statement" || lowered === "return") {
      statements.push({
        kind: "return",
        ...statementRange,
      });
      continue;
    }

    if (statementNode.type === "case_statement" || lowered === "case") {
      statements.push({
        kind: "case",
        ...statementRange,
      });
      continue;
    }

    if (statementNode.type === "expression_statement") {
      const expressionNode = statementNode.childForFieldName("expression");
      statements.push({
        kind: "expression",
        expressionText: isPresentNode(expressionNode)
          ? textOf(expressionNode, source)
          : textOf(statementNode, source),
        ...statementRange,
      });
      continue;
    }
  }

  if (
    tokenTexts.includes("if") &&
    !statements.some((item) => item.kind === "if")
  ) {
    statements.push({
      kind: "if",
      conditionText: undefined,
      thenText: "",
      ...bodyRange,
    });
  }

  if (
    tokenTexts.includes("case") &&
    !statements.some((item) => item.kind === "case")
  ) {
    statements.push({
      kind: "case",
      subjectText: undefined,
      ...bodyRange,
    });
  }

  if (
    tokenTexts.includes("accept") &&
    !statements.some((item) => item.kind === "accept")
  ) {
    statements.push({
      kind: "accept",
      ...bodyRange,
    });
  }

  if (
    tokenTexts.includes("reject") &&
    !statements.some((item) => item.kind === "reject")
  ) {
    statements.push({
      kind: "reject",
      ...bodyRange,
    });
  }

  if (
    tokenTexts.includes("return") &&
    !statements.some((item) => item.kind === "return")
  ) {
    statements.push({
      kind: "return",
      valueText: undefined,
      ...bodyRange,
    });
  }

  const hasExpressionStatement = statements.some(
    (item) => item.kind === "expression",
  );
  if (!hasExpressionStatement) {
    const segments = bodyText
      .split(";")
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);

    for (const segment of segments) {
      const normalizedSegment = segment
        .replace(/^[\s{]+/, "")
        .replace(/[\s}]+$/, "");
      if (normalizedSegment.length === 0) {
        continue;
      }

      if (
        normalizedSegment.startsWith("if ") ||
        normalizedSegment.startsWith("case ") ||
        normalizedSegment === "accept" ||
        normalizedSegment === "reject" ||
        normalizedSegment.startsWith("return")
      ) {
        continue;
      }

      statements.push({
        kind: "expression",
        expressionText: normalizedSegment,
        ...bodyRange,
      });
    }
  }

  return statements;
};

const collectLiteralsAndMatches = (
  bodyNode: SyntaxNode,
  source: string,
): { literals: ExtractedLiteral[]; matches: MatchExpression[] } => {
  const literals: ExtractedLiteral[] = [];
  const matches: MatchExpression[] = [];
  const isIpLike = (token: string): boolean => isStrictIpLiteral(token);

  const extractPrefixSuffix = (token: string): string | null => {
    const slashIndex = token.indexOf("/");
    if (slashIndex === -1) {
      return null;
    }

    const suffix = token.slice(slashIndex);
    const matched = suffix.match(
      /^\/(?:\d{1,3}(?:[+-]|\{\d{1,3}(?:,\d{1,3})?\})?)/,
    );
    return matched?.[0] ?? null;
  };

  const collectNode = (node: SyntaxNode): void => {
    const namedChildren = node.namedChildren;

    for (let index = 0; index < namedChildren.length; index += 1) {
      const current = namedChildren[index];
      if (!current) {
        continue;
      }

      const currentText = textOf(current, source);
      const currentRange = toRange(current, source);

      if (current.type === "ip_literal" && isStrictIpLiteral(currentText)) {
        literals.push({
          kind: "ip",
          value: currentText,
          ...currentRange,
        });
      }

      if (current.type === "prefix_literal") {
        literals.push({
          kind: "prefix",
          value: currentText,
          ...currentRange,
        });
      }

      if (current.type === "number" || current.type === "raw_token") {
        const ownSuffix = extractPrefixSuffix(currentText);
        if (ownSuffix) {
          const ipPart = currentText.slice(0, currentText.indexOf("/"));
          if (isIpLike(ipPart)) {
            literals.push({
              kind: "prefix",
              value: `${ipPart}${ownSuffix}`,
              ...currentRange,
            });
          }
        } else {
          const nextNode = namedChildren[index + 1];
          const nextText = nextNode ? textOf(nextNode, source) : "";
          const nextSuffix = nextNode ? extractPrefixSuffix(nextText) : null;

          if (nextSuffix && isIpLike(currentText)) {
            const mergedRange = mergeRanges(
              currentRange,
              toRange(nextNode, source),
            );
            literals.push({
              kind: "prefix",
              value: `${currentText}${nextSuffix}`,
              ...mergedRange,
            });
          } else if (isIpLike(currentText)) {
            literals.push({
              kind: "ip",
              value: currentText,
              ...currentRange,
            });
          }
        }
      }

      if (current.type === "binary_expression") {
        const operatorNode = current.childForFieldName("operator");
        const leftNode = current.childForFieldName("left");
        const rightNode = current.childForFieldName("right");

        if (
          isPresentNode(operatorNode) &&
          textOf(operatorNode, source) === "~"
        ) {
          matches.push({
            operator: "~",
            left: isPresentNode(leftNode) ? textOf(leftNode, source) : "",
            right: isPresentNode(rightNode) ? textOf(rightNode, source) : "",
            ...toRange(current, source),
          });
        }
      }

      if (currentText.trim() === "~") {
        const leftNode = namedChildren[index - 1];
        const immediateRightNode = namedChildren[index + 1];

        if (!leftNode || !immediateRightNode) {
          continue;
        }

        const leftText = textOf(leftNode, source).trim();
        const immediateRightText = textOf(immediateRightNode, source).trim();
        const rightNode =
          immediateRightText === "["
            ? (namedChildren[index + 2] ?? immediateRightNode)
            : immediateRightNode;
        const rightText = textOf(rightNode, source).trim();

        if (leftText.length === 0 || rightText.length === 0) {
          continue;
        }

        matches.push({
          operator: "~",
          left: leftText,
          right: rightText,
          ...currentRange,
        });
      }

      collectNode(current);
    }
  };

  collectNode(bodyNode);

  const literalKeys = new Set<string>();
  const uniqueLiterals: ExtractedLiteral[] = [];
  for (const literal of literals) {
    const key = `${literal.kind}:${literal.value}:${literal.line}:${literal.column}:${literal.endLine}:${literal.endColumn}`;
    if (literalKeys.has(key)) {
      continue;
    }

    literalKeys.add(key);
    uniqueLiterals.push(literal);
  }

  const matchKeys = new Set<string>();
  const uniqueMatches: MatchExpression[] = [];
  for (const match of matches) {
    const key = `${match.operator}:${match.left}:${match.right}:${match.line}:${match.column}:${match.endLine}:${match.endColumn}`;
    if (matchKeys.has(key)) {
      continue;
    }

    matchKeys.add(key);
    uniqueMatches.push(match);
  }

  return {
    literals: uniqueLiterals,
    matches: uniqueMatches,
  };
};

export const parseFilterDeclaration = (
  declarationNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): FilterDeclaration => {
  const declarationRange = toRange(declarationNode, source);
  const nameNode = declarationNode.childForFieldName("name");
  const bodyNode = declarationNode.childForFieldName("body");

  if (!isPresentNode(nameNode)) {
    pushMissingFieldIssue(
      issues,
      declarationNode,
      "Missing name for filter declaration",
      source,
    );
  }

  if (!isPresentNode(bodyNode)) {
    issues.push({
      code: "syntax/unbalanced-brace",
      message: "Missing '{' for filter declaration",
      ...declarationRange,
    });
  }

  const extracted = isPresentNode(bodyNode)
    ? collectLiteralsAndMatches(bodyNode, source)
    : { literals: [], matches: [] };

  return {
    kind: "filter",
    name: isPresentNode(nameNode) ? textOf(nameNode, source) : "",
    nameRange: isPresentNode(nameNode)
      ? toRange(nameNode, source)
      : declarationRange,
    statements: isPresentNode(bodyNode)
      ? parseControlStatements(bodyNode, source)
      : [],
    literals: extracted.literals,
    matches: extracted.matches,
    ...declarationRange,
  };
};

export const parseFunctionDeclaration = (
  declarationNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): FunctionDeclaration => {
  const declarationRange = toRange(declarationNode, source);
  const nameNode = declarationNode.childForFieldName("name");
  const bodyNode = declarationNode.childForFieldName("body");

  if (!isPresentNode(nameNode)) {
    pushMissingFieldIssue(
      issues,
      declarationNode,
      "Missing name for function declaration",
      source,
    );
  }

  if (!isPresentNode(bodyNode)) {
    issues.push({
      code: "syntax/unbalanced-brace",
      message: "Missing '{' for function declaration",
      ...declarationRange,
    });
  }

  const extracted = isPresentNode(bodyNode)
    ? collectLiteralsAndMatches(bodyNode, source)
    : { literals: [], matches: [] };

  return {
    kind: "function",
    name: isPresentNode(nameNode) ? textOf(nameNode, source) : "",
    nameRange: isPresentNode(nameNode)
      ? toRange(nameNode, source)
      : declarationRange,
    statements: isPresentNode(bodyNode)
      ? parseControlStatements(bodyNode, source)
      : [],
    literals: extracted.literals,
    matches: extracted.matches,
    ...declarationRange,
  };
};
