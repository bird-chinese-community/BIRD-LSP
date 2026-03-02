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
export type TableDeclaration = Extract<BirdDeclaration, { kind: "table" }>;
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
  "local_as_statement",
  "neighbor_statement",
  "import_statement",
  "export_statement",
  "channel_statement",
  "expression_statement",
]);

const TABLE_TYPES = new Set([
  "routing",
  "ipv4",
  "ipv6",
  "vpn4",
  "vpn6",
  "roa4",
  "roa6",
  "flow4",
  "flow6",
]);

const CHANNEL_TYPES = new Set([
  "ipv4",
  "ipv6",
  "vpn4",
  "vpn6",
  "roa4",
  "roa6",
  "flow4",
  "flow6",
  "mpls",
]);

const IPV4_LITERAL_PATTERN =
  /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_LITERAL_PATTERN = /^[0-9A-Fa-f:.]+$/;
const IPV4_CANDIDATE_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const IPV6_CANDIDATE_PATTERN = /^[0-9A-Fa-f:.]*:[0-9A-Fa-f:.]*$/;

export const isStrictIpv4Literal = (value: string): boolean =>
  IPV4_LITERAL_PATTERN.test(value) && isIP(value) === 4;

export const isStrictIpv6Literal = (value: string): boolean =>
  value.includes(":") && IPV6_LITERAL_PATTERN.test(value) && isIP(value) === 6;

export const isStrictIpLiteral = (value: string): boolean =>
  isStrictIpv4Literal(value) || isStrictIpv6Literal(value);

export const isIpLiteralCandidate = (value: string): boolean =>
  IPV4_CANDIDATE_PATTERN.test(value) || IPV6_CANDIDATE_PATTERN.test(value);

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
  const lowered = value.toLowerCase();
  return TABLE_TYPES.has(lowered)
    ? (lowered as TableDeclaration["tableType"])
    : "unknown";
};

export const normalizeChannelType = (
  value: string,
): ChannelStatement["channelType"] => {
  const lowered = value.toLowerCase();
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
