import { getParser } from "./runtime.js";
import { collectTreeIssues, dedupeIssues, parseFailureIssue } from "./issues.js";
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

export const parseBirdConfig = async (input: string): Promise<ParsedBirdDocument> => {
  const parser = await getParser();
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
    collectTreeIssues(tree.rootNode, issues);

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
