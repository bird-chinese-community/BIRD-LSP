import { getParser } from "./runtime.js";
import {
  collectTreeIssues,
  dedupeIssues,
  ensureBraceBalanceIssue,
  parseFailureIssue,
  runtimeFailureIssue,
  suppressRecoverableSyntaxIssues,
} from "./issues.js";
import { parseDeclarations } from "./declarations.js";
import type { ParseIssue, ParsedBirdDocument, SourceRange } from "./types.js";
import { collectBirdSyntaxLayout } from "./syntax-layout.js";
import { toRange } from "./tree.js";

export type { BirdSyntaxLayout } from "./syntax-layout.js";

export const findNetworkLiteralAt = async (
  input: string,
  position: { line: number; character: number },
): Promise<{
  value: string;
  kind: "ip" | "number";
  range: SourceRange;
} | null> => {
  if (position.line < 0 || position.character < 0) return null;
  const parser = await getParser();
  const tree = parser.parse(input);
  if (!tree) return null;
  try {
    let node = tree.rootNode.descendantForPosition({
      row: position.line,
      column: position.character,
    });
    let literal = null;
    while (node) {
      if (node.type === "comment" || node.type === "string") return null;
      if (
        node.type === "ipv4_literal" ||
        node.type === "ipv6_literal" ||
        node.type === "number"
      ) {
        literal = node;
      }
      node = node.parent;
    }
    if (!literal) return null;
    const range = toRange(literal, input);
    if (
      range.line !== position.line + 1 ||
      range.endLine !== range.line ||
      position.character < range.column - 1 ||
      position.character >= range.endColumn - 1
    )
      return null;
    return {
      value: literal.text,
      kind: literal.type === "number" ? "number" : "ip",
      range,
    };
  } finally {
    tree.delete();
  }
};

export type {
  AcceptStatement,
  AggregatorOptionStatement,
  AttributeDeclaration,
  BgpHopModeStatement,
  BgpOptionStatement,
  BgpTimerStatement,
  BirdDeclaration,
  BirdProgram,
  CaseStatement,
  ChannelAddPathsEntry,
  ChannelBaseTableEntry,
  ChannelBgpGracefulRestartEntry,
  ChannelBgpLinkLocalNextHopFormatEntry,
  ChannelBgpNextHopAddressEntry,
  ChannelBgpNextHopPreferEntry,
  ChannelBgpOptionEntry,
  ChannelDebugEntry,
  ChannelDomainEntry,
  ChannelEntry,
  ChannelExportEntry,
  ChannelImportEntry,
  ChannelIgpTableEntry,
  ChannelGatewayEntry,
  ChannelKeepFilteredEntry,
  ChannelLabelPolicyEntry,
  ChannelLabelRangeEntry,
  ChannelLimitEntry,
  ChannelOtherEntry,
  ChannelPreferenceEntry,
  ChannelRpkiReloadEntry,
  ChannelStatement,
  ChannelTableEntry,
  DefineDeclaration,
  DirectOptionStatement,
  DisabledStatement,
  ExpressionStatement,
  ExtractedLiteral,
  ExportStatement,
  FilterBodyStatement,
  FilterDeclaration,
  FunctionDeclaration,
  GracefulRestartWaitDeclaration,
  HostnameOverrideDeclaration,
  IfStatement,
  ImportStatement,
  IncludeDeclaration,
  LocalAsStatement,
  MatchExpression,
  MplsDomainDeclaration,
  MrtOptionStatement,
  NeighborStatement,
  OtherProtocolStatement,
  OtherStatement,
  ParseIssue,
  ParsedBirdDocument,
  PerfOptionStatement,
  ProtocolDeclaration,
  ProtocolDebugStatement,
  ProtocolInterfaceEntry,
  ProtocolInterfaceStatement,
  ProtocolMrtdumpStatement,
  ProtocolRestartTimeStatement,
  ProtocolRouterIdStatement,
  ProtocolTextStatement,
  ProtocolThreadGroupStatement,
  ProtocolStatement,
  RejectStatement,
  ReturnStatement,
  RouterIdDeclaration,
  ScanTimeStatement,
  SourceRange,
  SourceAddressStatement,
  StaticRouteStatement,
  TableDeclaration,
  TemplateDeclaration,
  TimeformatDeclaration,
  WatchdogDeclaration,
  LearnStatement,
  VrfStatement,
} from "./types.js";

/**
 * Parse one BIRD configuration text into AST V2 declarations and parser diagnostics.
 * Returns a degraded document with `parser/runtime-error` when Tree-sitter runtime cannot initialize.
 */
export const parseBirdConfig = async (
  input: string,
  options: { includeSyntaxLayout?: boolean } = {},
): Promise<ParsedBirdDocument> => {
  let parser;
  try {
    parser = await getParser();
  } catch (error) {
    return {
      program: {
        kind: "program",
        declarations: [],
      },
      issues: [runtimeFailureIssue(error)],
    };
  }

  const tree = parser.parse(input);

  if (!tree) {
    return {
      program: {
        kind: "program",
        declarations: [],
      },
      issues: [parseFailureIssue()],
    };
  }

  try {
    const issues: ParseIssue[] = [];
    collectTreeIssues(tree.rootNode, input, issues);
    ensureBraceBalanceIssue(input, issues);

    const declarations = parseDeclarations(tree.rootNode, input, issues);
    const normalizedIssues = suppressRecoverableSyntaxIssues(issues, input);

    return {
      program: {
        kind: "program",
        declarations,
      },
      issues: dedupeIssues(normalizedIssues),
      ...(options.includeSyntaxLayout
        ? { syntaxLayout: collectBirdSyntaxLayout(tree.rootNode, input) }
        : {}),
    };
  } finally {
    tree.delete();
  }
};
