import { isIP } from "node:net";
import type { Node as SyntaxNode } from "web-tree-sitter";
import type {
  BirdDeclaration,
  ProtocolStatement,
  SourceRange,
} from "../types.js";
import { isPresentNode, mergeRanges, textOf, toRange } from "../tree.js";

export type IncludeDeclaration = Extract<BirdDeclaration, { kind: "include" }>;
export type DefineDeclaration = Extract<BirdDeclaration, { kind: "define" }>;
export type RouterIdDeclaration = Extract<
  BirdDeclaration,
  { kind: "router-id" }
>;
export type GracefulRestartWaitDeclaration = Extract<
  BirdDeclaration,
  { kind: "graceful-restart-wait" }
>;
export type HostnameOverrideDeclaration = Extract<
  BirdDeclaration,
  { kind: "hostname-override" }
>;
export type AttributeDeclaration = Extract<
  BirdDeclaration,
  { kind: "attribute" }
>;
export type TableDeclaration = Extract<BirdDeclaration, { kind: "table" }>;
export type MplsDomainDeclaration = Extract<
  BirdDeclaration,
  { kind: "mpls-domain" }
>;
export type TimeformatDeclaration = Extract<
  BirdDeclaration,
  { kind: "timeformat" }
>;
export type WatchdogDeclaration = Extract<
  BirdDeclaration,
  { kind: "watchdog" }
>;
export type ProtocolDeclaration = Extract<
  BirdDeclaration,
  { kind: "protocol" }
>;
export type TemplateDeclaration = Extract<
  BirdDeclaration,
  { kind: "template" }
>;
export type FilterDeclaration = Extract<BirdDeclaration, { kind: "filter" }>;
export type FunctionDeclaration = Extract<
  BirdDeclaration,
  { kind: "function" }
>;
export type ExtractedLiteral = FilterDeclaration["literals"][number];
export type MatchExpression = FilterDeclaration["matches"][number];

type ChannelStatement = Extract<ProtocolStatement, { kind: "channel" }>;

export const PROTOCOL_STATEMENT_TYPES = new Set([
  "local_role_statement",
  "local_as_statement",
  "neighbor_statement",
  "import_statement",
  "export_statement",
  "channel_statement",
  "expression_statement",
]);

export const splitTopLevelStatements = (body: string): string[] => {
  const statements: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    const nextChar = body[index + 1];

    // Single-line comments (# or //)
    if (char === "#" || (char === "/" && nextChar === "/")) {
      while (index < body.length && body[index] !== "\n") {
        index += 1;
      }
      if (depth === 0) {
        start = index < body.length ? index + 1 : body.length;
      }
      continue;
    }

    // Multi-line comments (/* ... */)
    if (char === "/" && nextChar === "*") {
      index += 2;
      while (index < body.length - 1) {
        if (body[index] === "*" && body[index + 1] === "/") {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }

    // Quoted strings
    if (char === '"' || char === "'") {
      const quote = char;
      index += 1;
      while (index < body.length) {
        if (body[index] === "\\") {
          index += 1;
        } else if (body[index] === quote) {
          break;
        }
        index += 1;
      }
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        statements.push(body.slice(start, index + 1));
        start = index + 1;
        while (
          start < body.length &&
          (body[start] === ";" || /\s/u.test(body[start] ?? ""))
        ) {
          start += 1;
        }
        index = start - 1;
      }
      continue;
    }

    if (char === ";" && depth === 0) {
      statements.push(body.slice(start, index));
      start = index + 1;
    }
  }

  const tail = body.slice(start).trim();
  if (tail.length > 0) {
    statements.push(tail);
  }

  return statements;
};

export const TABLE_TYPES = new Set([
  "routing",
  "ipv4",
  "ipv6",
  "ipv4-mpls",
  "ipv6-mpls",
  "vpn4",
  "vpn6",
  "vpn4-mpls",
  "vpn6-mpls",
  "roa4",
  "roa6",
  "aspa",
  "mpls",
  "eth",
  "evpn",
  "neighbor",
  "ipv6-sadr",
  "flow4",
  "flow6",
]);

const CHANNEL_TYPES = new Set([
  "ipv4",
  "ipv6",
  "ipv4-mpls",
  "ipv6-mpls",
  "vpn4",
  "vpn6",
  "vpn4-mpls",
  "vpn6-mpls",
  "roa4",
  "roa6",
  "ipv6-sadr",
  "flow4",
  "flow6",
  "mpls",
]);

export const isStrictIpv4Literal = (value: string): boolean =>
  isIP(value) === 4;

export const isStrictIpv6Literal = (value: string): boolean =>
  isIP(value) === 6;

export const isStrictIpLiteral = (value: string): boolean =>
  isStrictIpv4Literal(value) || isStrictIpv6Literal(value);

const isAsciiDigit = (char: string): boolean => char >= "0" && char <= "9";

const isAsciiHexDigit = (char: string): boolean =>
  isAsciiDigit(char) ||
  (char >= "a" && char <= "f") ||
  (char >= "A" && char <= "F");

const isIpv4CandidateShape = (value: string): boolean => {
  let dotCount = 0;
  let segmentLength = 0;

  for (const char of value) {
    if (isAsciiDigit(char)) {
      segmentLength += 1;
      if (segmentLength > 3) {
        return false;
      }
      continue;
    }

    if (char !== ".") {
      return false;
    }

    if (segmentLength === 0) {
      return false;
    }

    dotCount += 1;
    segmentLength = 0;
  }

  return dotCount === 3 && segmentLength > 0;
};

const isIpv6CandidateShape = (value: string): boolean => {
  let hasColon = false;

  for (const char of value) {
    if (char === ":") {
      hasColon = true;
      continue;
    }

    if (char === "." || isAsciiHexDigit(char)) {
      continue;
    }

    return false;
  }

  return hasColon;
};

export const isIpLiteralCandidate = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }

  if (isIP(trimmed) !== 0) {
    return true;
  }

  if (trimmed.includes(".")) {
    return isIpv4CandidateShape(trimmed);
  }

  if (trimmed.includes(":")) {
    return isIpv6CandidateShape(trimmed);
  }

  return false;
};

export const protocolStatementNodesOf = (
  blockNode: SyntaxNode,
): SyntaxNode[] => {
  return blockNode.namedChildren.filter((child) =>
    PROTOCOL_STATEMENT_TYPES.has(child.type),
  );
};

export const protocolTypeTextAndRange = (
  protocolTypeNode: SyntaxNode | null,
  protocolVariantNode: SyntaxNode | null,
  source: string,
  declarationRange: SourceRange,
): { protocolType: string; protocolTypeRange: SourceRange } => {
  const protocolType = isPresentNode(protocolTypeNode)
    ? [
        textOf(protocolTypeNode, source),
        isPresentNode(protocolVariantNode)
          ? textOf(protocolVariantNode, source)
          : "",
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  const protocolTypeRange =
    isPresentNode(protocolTypeNode) && isPresentNode(protocolVariantNode)
      ? mergeRanges(
          toRange(protocolTypeNode, source),
          toRange(protocolVariantNode, source),
        )
      : isPresentNode(protocolTypeNode)
        ? toRange(protocolTypeNode, source)
        : declarationRange;

  return { protocolType, protocolTypeRange };
};

export const normalizeTableType = (
  value: string,
): TableDeclaration["tableType"] => {
  const lowered = value.toLowerCase().replace(/\s+/g, "-");
  return TABLE_TYPES.has(lowered)
    ? (lowered as TableDeclaration["tableType"])
    : "unknown";
};

export const normalizeChannelType = (
  value: string,
): ChannelStatement["channelType"] => {
  const lowered = value.toLowerCase().replace(/\s+/g, "-");
  return CHANNEL_TYPES.has(lowered)
    ? (lowered as ChannelStatement["channelType"])
    : "unknown";
};

export const nodeOrSelf = (node: SyntaxNode): SyntaxNode => {
  if (node.namedChildCount === 1) {
    const child = node.namedChildren[0];
    if (child) {
      return child;
    }
  }

  return node;
};

export const CHANNEL_DIRECTIONS = new Set(["import", "receive", "export"]);

export const isNumericToken = (value: string): boolean => {
  if (value.length === 0) {
    return false;
  }

  for (const char of value) {
    if (char < "0" || char > "9") {
      return false;
    }
  }

  return true;
};

export interface TopLevelToken {
  text: string;
  lowered: string;
  range: SourceRange;
}

export const topLevelTokensOf = (
  statementNode: SyntaxNode,
  source: string,
): TopLevelToken[] => {
  const tokens: TopLevelToken[] = [];
  for (const tokenNode of statementNode.namedChildren) {
    const tokenText = textOf(tokenNode, source).trim();
    if (tokenText.length === 0) {
      continue;
    }

    tokens.push({
      text: tokenText,
      lowered: tokenText.toLowerCase(),
      range: toRange(tokenNode),
    });
  }

  return tokens;
};

export const mergedTokenRange = (
  declarationRange: SourceRange,
  tokens: TopLevelToken[],
  startIndex: number,
  endIndex: number,
): SourceRange => {
  const startToken = tokens[startIndex];
  const endToken = tokens[endIndex];
  if (!startToken || !endToken) {
    return declarationRange;
  }

  return mergeRanges(startToken.range, endToken.range);
};
