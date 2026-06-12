import type { Node as SyntaxNode } from "web-tree-sitter";
import type {
  FilterBodyStatement,
  FunctionCallExpression,
  ParseIssue,
} from "../types.js";
import { pushMissingFieldIssue } from "../issues.js";
import { isPresentNode, mergeRanges, textOf, toRange } from "../tree.js";
import {
  type ExtractedLiteral,
  type FilterDeclaration,
  type FunctionDeclaration,
  type MatchExpression,
  isStrictIpLiteral,
} from "./shared.js";

const parseFilterSegmentStatement = (
  segment: string,
  range: ReturnType<typeof toRange>,
): FilterBodyStatement | undefined => {
  const normalizedSegment = segment.trim().replace(/;\s*$/u, "");
  const normalizedPrintMatch = normalizedSegment.match(/^print(n)?\s+(.+)$/iu);
  if (normalizedPrintMatch) {
    return {
      kind: "print",
      newline: normalizedPrintMatch[1] !== "n",
      argumentsText: (normalizedPrintMatch[2] ?? "").trim(),
      ...range,
    };
  }

  const unsetMatch = normalizedSegment.match(/^unset\s*\(\s*([^)]+?)\s*\)$/iu);
  if (unsetMatch) {
    return {
      kind: "unset",
      attributeText: (unsetMatch[1] ?? "").trim(),
      ...range,
    };
  }

  // Match plain assignments like `target = value`, but reject comparison
  // operators (`==`, `!=`, `<=`, `>=`) so bare comparison expression
  // statements are not misclassified as assignments.
  const assignmentMatch = normalizedSegment.match(
    /^([A-Za-z_][A-Za-z0-9_.]*(?:\[[^\]]+\])?)\s*(?<![<>!=])=(?!=)\s*(.+)$/u,
  );
  if (assignmentMatch) {
    return {
      kind: "assignment",
      targetText: (assignmentMatch[1] ?? "").trim(),
      valueText: (assignmentMatch[2] ?? "").trim(),
      ...range,
    };
  }

  return undefined;
};

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
      const valueNode = statementNode.childForFieldName("value");
      statements.push({
        kind: "return",
        valueText: isPresentNode(valueNode)
          ? textOf(valueNode, source)
          : undefined,
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
      const expressionText = isPresentNode(expressionNode)
        ? textOf(expressionNode, source)
        : textOf(statementNode, source);
      const parsedStatement = parseFilterSegmentStatement(
        expressionText,
        statementRange,
      );
      if (parsedStatement) {
        statements.push(parsedStatement);
        continue;
      }

      statements.push({
        kind: "expression",
        expressionText,
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
    (tokenTexts.includes("accept") ||
      /\baccept\b/.test(bodyText.toLowerCase())) &&
    !statements.some((item) => item.kind === "accept")
  ) {
    statements.push({
      kind: "accept",
      ...bodyRange,
    });
  }

  if (
    (tokenTexts.includes("reject") ||
      /\breject\b/.test(bodyText.toLowerCase())) &&
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

      const parsedStatement = parseFilterSegmentStatement(
        normalizedSegment,
        bodyRange,
      );
      if (parsedStatement) {
        statements.push(parsedStatement);
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

const FUNCTION_LEADING_DECLARATION_PATTERN =
  /\b(int|bool|string|ip|prefix|pair|quad|ec|lc|bgppath|clist|eclist|lclist)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*=\s*([^;]+))?\s*;/giu;

const collectFunctionLeadingDeclarations = (
  declarationNode: SyntaxNode,
  bodyNode: SyntaxNode,
  source: string,
): FilterBodyStatement[] => {
  const statements: FilterBodyStatement[] = [];
  const declarationRange = toRange(declarationNode, source);
  const declarationHead = source.slice(
    declarationNode.startIndex,
    bodyNode.startIndex,
  );

  FUNCTION_LEADING_DECLARATION_PATTERN.lastIndex = 0;
  let current = FUNCTION_LEADING_DECLARATION_PATTERN.exec(declarationHead);
  while (current) {
    const declaredType = (current[1] ?? "").trim().toLowerCase();
    const variableName = (current[2] ?? "").trim();
    const initializer = current[3]?.trim();

    if (declaredType && variableName) {
      statements.push({
        kind: "expression",
        expressionText: initializer
          ? `${declaredType} ${variableName} = ${initializer}`
          : `${declaredType} ${variableName}`,
        ...declarationRange,
      });
    }

    current = FUNCTION_LEADING_DECLARATION_PATTERN.exec(declarationHead);
  }

  return statements;
};

const FILTER_KEYWORD_DENYLIST = new Set([
  "if",
  "then",
  "else",
  "case",
  "for",
  "do",
  "while",
  "return",
  "accept",
  "reject",
  "print",
  "printn",
  "unset",
  "in",
]);

const collectLiteralsAndMatches = (
  bodyNode: SyntaxNode,
  source: string,
): {
  literals: ExtractedLiteral[];
  matches: MatchExpression[];
  calls: FunctionCallExpression[];
} => {
  const literals: ExtractedLiteral[] = [];
  const matches: MatchExpression[] = [];
  const calls: FunctionCallExpression[] = [];
  const isIpLike = (token: string): boolean => isStrictIpLiteral(token);
  const pushTextCall = (
    callText: string,
    range: ReturnType<typeof toRange>,
  ): void => {
    const nameMatch = callText.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/u);
    const openParenIndex = callText.indexOf("(");
    const closeParenIndex = callText.lastIndexOf(")");
    if (
      !nameMatch?.[1] ||
      openParenIndex === -1 ||
      closeParenIndex <= openParenIndex
    ) {
      return;
    }

    const name = nameMatch[1];
    if (FILTER_KEYWORD_DENYLIST.has(name.toLowerCase())) {
      return;
    }
    calls.push({
      name,
      nameRange: {
        line: range.line,
        column: range.column + callText.indexOf(name),
        endLine: range.line,
        endColumn: range.column + callText.indexOf(name) + name.length,
      },
      argumentsText: callText.slice(openParenIndex + 1, closeParenIndex).trim(),
      ...range,
    });
  };

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

      if (current.type === "function_call") {
        pushTextCall(textOf(current, source), currentRange);
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

  const bodyText = textOf(bodyNode, source);
  const bodyRange = toRange(bodyNode, source);
  const bodyLines = bodyText.split(/\r?\n/);
  const callPattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(([^();{}]*)\)/gu;
  for (let lineOffset = 0; lineOffset < bodyLines.length; lineOffset += 1) {
    const lineText = bodyLines[lineOffset] ?? "";
    const sourceLine = bodyRange.line + lineOffset;
    const lineStartColumn = lineOffset === 0 ? bodyRange.column : 1;

    callPattern.lastIndex = 0;
    let match = callPattern.exec(lineText);
    while (match) {
      const matchedText = match[0];
      const startColumn = Math.max(1, lineStartColumn + match.index);
      pushTextCall(matchedText, {
        line: sourceLine,
        column: startColumn,
        endLine: sourceLine,
        endColumn: startColumn + matchedText.length,
      });
      match = callPattern.exec(lineText);
    }
  }

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

  const callKeys = new Set<string>();
  const uniqueCalls: FunctionCallExpression[] = [];
  for (const call of calls) {
    const key = `${call.name}:${call.argumentsText}:${call.line}:${call.column}:${call.endLine}:${call.endColumn}`;
    if (callKeys.has(key)) {
      continue;
    }

    callKeys.add(key);
    uniqueCalls.push(call);
  }

  return {
    literals: uniqueLiterals,
    matches: uniqueMatches,
    calls: uniqueCalls,
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
    : { literals: [], matches: [], calls: [] };

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
    calls: extracted.calls,
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
    : { literals: [], matches: [], calls: [] };
  const leadingDeclarations = isPresentNode(bodyNode)
    ? collectFunctionLeadingDeclarations(declarationNode, bodyNode, source)
    : [];
  const bodyStatements = isPresentNode(bodyNode)
    ? parseControlStatements(bodyNode, source)
    : [];

  return {
    kind: "function",
    name: isPresentNode(nameNode) ? textOf(nameNode, source) : "",
    nameRange: isPresentNode(nameNode)
      ? toRange(nameNode, source)
      : declarationRange,
    statements: [...leadingDeclarations, ...bodyStatements],
    literals: extracted.literals,
    matches: extracted.matches,
    calls: extracted.calls,
    ...declarationRange,
  };
};
