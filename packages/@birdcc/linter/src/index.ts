import { buildCoreSnapshotFromParsed, type BirdDiagnostic, type CoreSnapshot } from "@birdcc/core";
import { parseBirdConfig, type ParsedBirdDocument, type ProtocolDeclaration } from "@birdcc/parser";

export interface RuleContext {
  text: string;
  parsed: ParsedBirdDocument;
  core: CoreSnapshot;
}

export type BirdRule = (context: RuleContext) => BirdDiagnostic[];

export interface LintResult {
  parsed: ParsedBirdDocument;
  core: CoreSnapshot;
  diagnostics: BirdDiagnostic[];
}

const createProtocolDiagnostic = (
  code: string,
  message: string,
  declaration: ProtocolDeclaration,
): BirdDiagnostic => ({
  code,
  message,
  severity: "warning",
  source: "linter",
  range: {
    line: declaration.nameRange.line,
    column: declaration.nameRange.column,
    endLine: declaration.nameRange.endLine,
    endColumn: declaration.nameRange.endColumn,
  },
});

const isBgpProtocol = (declaration: ProtocolDeclaration): boolean =>
  declaration.protocolType.toLowerCase() === "bgp";

const isOspfProtocol = (declaration: ProtocolDeclaration): boolean =>
  declaration.protocolType.toLowerCase() === "ospf";

const protocolDeclarations = (parsed: ParsedBirdDocument): ProtocolDeclaration[] =>
  parsed.program.declarations.filter(
    (declaration): declaration is ProtocolDeclaration => declaration.kind === "protocol",
  );

const bgpLocalAsRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const declaration of protocolDeclarations(parsed)) {
    if (!isBgpProtocol(declaration)) {
      continue;
    }

    const hasLocalAs = declaration.statements.some((statement) => statement.kind === "local-as");
    if (!hasLocalAs) {
      diagnostics.push(
        createProtocolDiagnostic(
          "protocol/bgp-missing-local-as",
          `BGP protocol '${declaration.name}' missing local as configuration`,
          declaration,
        ),
      );
    }
  }

  return diagnostics;
};

const bgpNeighborRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const declaration of protocolDeclarations(parsed)) {
    if (!isBgpProtocol(declaration)) {
      continue;
    }

    const hasNeighbor = declaration.statements.some((statement) => statement.kind === "neighbor");
    if (!hasNeighbor) {
      diagnostics.push(
        createProtocolDiagnostic(
          "protocol/bgp-missing-neighbor",
          `BGP protocol '${declaration.name}' missing neighbor configuration`,
          declaration,
        ),
      );
    }
  }

  return diagnostics;
};

const ospfAreaRequiredRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const declaration of protocolDeclarations(parsed)) {
    if (!isOspfProtocol(declaration)) {
      continue;
    }

    const hasArea = declaration.statements.some(
      (statement) => statement.kind === "other" && /^area\b/i.test(statement.text.trim()),
    );

    if (!hasArea) {
      diagnostics.push(
        createProtocolDiagnostic(
          "protocol/ospf-area-required",
          `OSPF protocol '${declaration.name}' missing area configuration`,
          declaration,
        ),
      );
    }
  }

  return diagnostics;
};

const defaultRules: BirdRule[] = [bgpLocalAsRule, bgpNeighborRule, ospfAreaRequiredRule];

/** Runs parser + core + lint rules and returns merged diagnostics. */
export const lintBirdConfig = async (text: string): Promise<LintResult> => {
  const parsed = await parseBirdConfig(text);
  const core = buildCoreSnapshotFromParsed(parsed);
  const context: RuleContext = { text, parsed, core };

  const parserDiagnostics: BirdDiagnostic[] = parsed.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    severity: "error",
    source: "parser",
    range: {
      line: issue.line,
      column: issue.column,
      endLine: issue.endLine,
      endColumn: issue.endColumn,
    },
  }));

  const ruleDiagnostics = defaultRules.flatMap((rule) => rule(context));

  return {
    parsed,
    core,
    diagnostics: [...parserDiagnostics, ...core.diagnostics, ...ruleDiagnostics],
  };
};
