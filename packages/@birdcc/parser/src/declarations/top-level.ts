import type { Node as SyntaxNode } from "web-tree-sitter";
import type { ParseIssue } from "../types.js";
import { stripQuotes, textOf, toRange } from "../tree.js";
import {
  TABLE_TYPES,
  type GracefulRestartWaitDeclaration,
  type HostnameOverrideDeclaration,
  type RouterIdDeclaration,
  type TableDeclaration,
  type TimeformatDeclaration,
  type WatchdogDeclaration,
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

export const parseGracefulRestartWaitFromStatement = (
  statementNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): GracefulRestartWaitDeclaration | null => {
  const declarationRange = toRange(statementNode, source);
  const tokens = topLevelTokensOf(statementNode, source);

  if (
    tokens[0]?.lowered !== "graceful" ||
    tokens[1]?.lowered !== "restart" ||
    tokens[2]?.lowered !== "wait"
  ) {
    return null;
  }

  const valueTokens = tokens.slice(3);
  const value = valueTokens
    .map((token) => token.text)
    .join(" ")
    .trim();
  const valueRange = mergedTokenRange(
    declarationRange,
    tokens,
    3,
    Math.max(tokens.length - 1, 3),
  );

  if (value.length === 0) {
    issues.push({
      code: "parser/missing-symbol",
      message: "Missing value for graceful restart wait declaration",
      ...declarationRange,
    });
  }

  return {
    kind: "graceful-restart-wait",
    value,
    valueRange,
    ...declarationRange,
  };
};

export const parseHostnameOverrideFromStatement = (
  statementNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): HostnameOverrideDeclaration | null => {
  const declarationRange = toRange(statementNode, source);
  const tokens = topLevelTokensOf(statementNode, source);

  if (tokens[0]?.lowered !== "hostname") {
    return null;
  }

  const valueToken = tokens[1];
  const valueText = valueToken?.text ?? "";
  const valueRange = valueToken?.range ?? declarationRange;

  if (valueText.length === 0) {
    issues.push({
      code: "parser/missing-symbol",
      message: "Missing value for hostname override declaration",
      ...declarationRange,
    });
  }

  return {
    kind: "hostname-override",
    value: stripQuotes(valueText),
    valueText,
    valueRange,
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
    tokens[0]?.lowered === "ipv6" &&
    tokens[1]?.lowered === "sadr" &&
    tokens[2]?.lowered === "table"
  ) {
    tableType = "ipv6-sadr";
    tableTypeRange = mergedTokenRange(declarationRange, tokens, 0, 1);
    name = tokens[3]?.text ?? "";
    nameTokenIndex = 3;
    attrsStartIndex = 4;
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
    entries: [],
    ...declarationRange,
  };
};

const TIMEFORMAT_SCOPES = new Set(["route", "protocol", "base", "log"]);

const tokenLikeFromNode = (
  node: SyntaxNode | null,
  source: string,
): {
  text: string;
  lowered: string;
  range: ReturnType<typeof toRange>;
} | null => {
  if (!node) {
    return null;
  }

  const text = textOf(node, source).trim();
  if (text.length === 0) {
    return null;
  }

  return {
    text,
    lowered: text.toLowerCase(),
    range: toRange(node, source),
  };
};

export const parseTimeformatFromStatement = (
  statementNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): TimeformatDeclaration | null => {
  const declarationRange = toRange(statementNode, source);
  const tokens = topLevelTokensOf(statementNode, source);
  const isTimeformatStatement =
    statementNode.type === "timeformat_statement" ||
    tokens[0]?.lowered === "timeformat";

  if (!isTimeformatStatement) {
    return null;
  }

  const scopeToken =
    tokenLikeFromNode(statementNode.childForFieldName("scope"), source) ??
    tokens[1];
  const formatToken =
    tokenLikeFromNode(statementNode.childForFieldName("format"), source) ??
    tokens[2];
  const limitToken =
    tokenLikeFromNode(statementNode.childForFieldName("limit"), source) ??
    tokens[3];
  const fallbackFormatToken =
    tokenLikeFromNode(
      statementNode.childForFieldName("fallback_format"),
      source,
    ) ?? tokens[4];

  if (!scopeToken) {
    issues.push({
      code: "parser/missing-symbol",
      message: "Missing scope for timeformat declaration",
      ...declarationRange,
    });
  }

  if (!formatToken) {
    issues.push({
      code: "parser/missing-symbol",
      message: "Missing format for timeformat declaration",
      ...declarationRange,
    });
  }

  const scope = TIMEFORMAT_SCOPES.has(scopeToken?.lowered ?? "")
    ? (scopeToken?.lowered as TimeformatDeclaration["scope"])
    : "unknown";
  const formatText = formatToken?.text ?? "";

  return {
    kind: "timeformat",
    scope,
    scopeRange: scopeToken?.range ?? declarationRange,
    format: stripQuotes(formatText),
    formatText,
    formatRange: formatToken?.range ?? declarationRange,
    limit: limitToken?.text,
    limitRange: limitToken?.range,
    fallbackFormat: fallbackFormatToken
      ? stripQuotes(fallbackFormatToken.text)
      : undefined,
    fallbackFormatText: fallbackFormatToken?.text,
    fallbackFormatRange: fallbackFormatToken?.range,
    ...declarationRange,
  };
};

const WATCHDOG_OPTIONS = new Set(["warning", "timeout"]);

export const parseWatchdogFromStatement = (
  statementNode: SyntaxNode,
  source: string,
  issues: ParseIssue[],
): WatchdogDeclaration | null => {
  const declarationRange = toRange(statementNode, source);
  const tokens = topLevelTokensOf(statementNode, source);
  const isWatchdogStatement =
    statementNode.type === "watchdog_statement" ||
    tokens[0]?.lowered === "watchdog";

  if (!isWatchdogStatement) {
    return null;
  }

  const optionToken =
    tokenLikeFromNode(statementNode.childForFieldName("option"), source) ??
    tokens[1];
  const valueTokenStart = statementNode.type === "watchdog_statement" ? 0 : 2;
  const valueTokens = tokens.slice(valueTokenStart);
  const value = valueTokens
    .map((token) => token.text)
    .join(" ")
    .trim();
  const valueRange = mergedTokenRange(
    declarationRange,
    tokens,
    valueTokenStart,
    Math.max(tokens.length - 1, valueTokenStart),
  );

  if (!optionToken) {
    issues.push({
      code: "parser/missing-symbol",
      message: "Missing option for watchdog declaration",
      ...declarationRange,
    });
  }

  if (value.length === 0) {
    issues.push({
      code: "parser/missing-symbol",
      message: "Missing value for watchdog declaration",
      ...declarationRange,
    });
  }

  const option = WATCHDOG_OPTIONS.has(optionToken?.lowered ?? "")
    ? (optionToken?.lowered as WatchdogDeclaration["option"])
    : "unknown";

  return {
    kind: "watchdog",
    option,
    optionRange: optionToken?.range ?? declarationRange,
    value,
    valueRange,
    ...declarationRange,
  };
};
