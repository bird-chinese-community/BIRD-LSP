import { getParser } from "./runtime.js";
import {
  collectTreeIssues,
  dedupeIssues,
  ensureBraceBalanceIssue,
  parseFailureIssue,
  runtimeFailureIssue,
} from "./issues.js";
import { parseDeclarations } from "./declarations.js";
import type { ParseIssue, ParsedBirdDocument } from "./types.js";

export type {
  AcceptStatement,
  BirdDeclaration,
  BirdProgram,
  CaseStatement,
  ChannelDebugEntry,
  ChannelEntry,
  ChannelExportEntry,
  ChannelImportEntry,
  ChannelKeepFilteredEntry,
  ChannelLimitEntry,
  ChannelOtherEntry,
  ChannelStatement,
  ChannelTableEntry,
  DefineDeclaration,
  ExpressionStatement,
  ExtractedLiteral,
  ExportStatement,
  FilterBodyStatement,
  FilterDeclaration,
  FunctionDeclaration,
  IfStatement,
  ImportStatement,
  IncludeDeclaration,
  LocalAsStatement,
  MatchExpression,
  NeighborStatement,
  OtherStatement,
  ParseIssue,
  ParsedBirdDocument,
  ProtocolDeclaration,
  ProtocolStatement,
  RejectStatement,
  ReturnStatement,
  RouterIdDeclaration,
  SourceRange,
  TableDeclaration,
  TemplateDeclaration,
} from "./types.js";

/**
 * Parse one BIRD configuration text into AST V2 declarations and parser diagnostics.
 * Returns a degraded document with `parser/runtime-error` when Tree-sitter runtime cannot initialize.
 */
export const parseBirdConfig = async (input: string): Promise<ParsedBirdDocument> => {
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

    return {
      program: {
        kind: "program",
        declarations,
      },
      issues: dedupeIssues(issues),
    };
  } finally {
    tree.delete();
  }
};
