import { getParser } from "./runtime.js";
import {
  collectTreeIssues,
  dedupeIssues,
  parseFailureIssue,
  runtimeFailureIssue,
} from "./issues.js";
import { parseDeclarations } from "./declarations.js";
import type { ParseIssue, ParsedBirdDocument } from "./types.js";

export type {
  BirdDeclaration,
  BirdProgram,
  DefineDeclaration,
  ExportStatement,
  FilterDeclaration,
  FunctionDeclaration,
  ImportStatement,
  IncludeDeclaration,
  LocalAsStatement,
  NeighborStatement,
  ParseIssue,
  ParsedBirdDocument,
  ProtocolDeclaration,
  ProtocolStatement,
  SourceRange,
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
