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
import type { ParseIssue, ParsedBirdDocument } from "./types.js";

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
  LearnStatement,
  VrfStatement,
} from "./types.js";

/**
 * Parse one BIRD configuration text into AST V2 declarations and parser diagnostics.
 * Returns a degraded document with `parser/runtime-error` when Tree-sitter runtime cannot initialize.
 */
export const parseBirdConfig = async (
  input: string,
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
    };
  } finally {
    tree.delete();
  }
};
