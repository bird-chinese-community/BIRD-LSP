import type { Node as SyntaxNode } from "web-tree-sitter";
import type { ParseIssue } from "../types.js";
import { toRange } from "../tree.js";
import {
  TABLE_TYPES,
  type RouterIdDeclaration,
  type TableDeclaration,
  isNumericToken,
  isStrictIpv4Literal,
  mergedTokenRange,
  normalizeTableType,
  topLevelTokensOf,
} from "./shared.js";

export const parseRouterIdFromStatement = (
  statementNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): RouterIdDeclaration | null => {
  const declarationRange = toRange(statementNode, source);
  const tokens = topLevelTokensOf(statementNode, source);

  if (tokens[0]?.lowered !== "router" || tokens[1]?.lowered !== "id") {
    return null;
  }

  const valueTokens = tokens.slice(2);
  const value = valueTokens
    .map((token) => token.text)
    .join(" ")
    .trim();
  const valueRange = mergedTokenRange(
    declarationRange,
    tokens,
    2,
    Math.max(tokens.length - 1, 2),
  );

  if (value.length === 0) {
    issues.push({
      code: "parser/missing-symbol",
      message: "Missing value for router id declaration",
      ...declarationRange,
    });

    return {
      kind: "router-id",
      value: "",
      valueKind: "unknown",
      valueRange: valueRange,
      ...declarationRange,
    };
  }

  if (valueTokens.length === 2 && valueTokens[0]?.lowered === "from") {
    const fromSourceToken = valueTokens[1]?.lowered;
    if (fromSourceToken !== "routing" && fromSourceToken !== "dynamic") {
      return {
        kind: "router-id",
        value,
        valueKind: "unknown",
        valueRange: valueRange,
        ...declarationRange,
      };
    }

    return {
      kind: "router-id",
      value,
      valueKind: "from",
      valueRange: valueRange,
      fromSource: fromSourceToken,
      ...declarationRange,
    };
  }

  if (valueTokens.length === 1 && isStrictIpv4Literal(value)) {
    return {
      kind: "router-id",
      value,
      valueKind: "ip",
      valueRange: valueRange,
      ...declarationRange,
    };
  }

  if (valueTokens.length === 1 && isNumericToken(value)) {
    return {
      kind: "router-id",
      value,
      valueKind: "number",
      valueRange: valueRange,
      ...declarationRange,
    };
  }

  return {
    kind: "router-id",
    value,
    valueKind: "unknown",
    valueRange: valueRange,
    ...declarationRange,
  };
};

export const parseTableFromStatement = (
  statementNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): TableDeclaration | null => {
  const declarationRange = toRange(statementNode, source);
  const tokens = topLevelTokensOf(statementNode, source);
  if (tokens.length === 0) {
    return null;
  }

  let tableType: TableDeclaration["tableType"] = "unknown";
  let name = "";
  let attrsText: string | undefined;
  let tableTypeRange = declarationRange;
  let nameRange = declarationRange;
  let attrsRange: TableDeclaration["attrsRange"];
  let nameTokenIndex = -1;
  let attrsStartIndex = -1;

  if (tokens[0]?.lowered === "routing" && tokens[1]?.lowered === "table") {
    tableType = "routing";
    tableTypeRange = tokens[0].range;
    name = tokens[2]?.text ?? "";
    nameTokenIndex = 2;
    attrsStartIndex = 3;
  } else if (
    TABLE_TYPES.has(tokens[0]?.lowered ?? "") &&
    tokens[1]?.lowered === "table"
  ) {
    tableType = normalizeTableType(tokens[0]?.text ?? "");
    tableTypeRange = tokens[0]?.range ?? declarationRange;
    name = tokens[2]?.text ?? "";
    nameTokenIndex = 2;
    attrsStartIndex = 3;
  } else if (tokens[0]?.lowered === "table") {
    tableType = "unknown";
    name = tokens[1]?.text ?? "";
    nameTokenIndex = 1;
    attrsStartIndex = 2;
  } else {
    return null;
  }

  if (nameTokenIndex >= 0 && tokens[nameTokenIndex]) {
    nameRange = tokens[nameTokenIndex].range;
  }

  if (attrsStartIndex >= 0 && attrsStartIndex < tokens.length) {
    attrsText = tokens
      .slice(attrsStartIndex)
      .map((token) => token.text)
      .join(" ");
    attrsRange = mergedTokenRange(
      declarationRange,
      tokens,
      attrsStartIndex,
      tokens.length - 1,
    );
  }

  if (name.length === 0) {
    issues.push({
      code: "parser/missing-symbol",
      message: "Missing name for table declaration",
      ...declarationRange,
    });
  }

  return {
    kind: "table",
    tableType,
    tableTypeRange,
    name,
    nameRange,
    attrsText,
    attrsRange,
    ...declarationRange,
  };
};
