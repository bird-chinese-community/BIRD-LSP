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

const hasTokenSequence = (tokens: string[], sequence: string[]): boolean => {
  if (tokens.length < sequence.length) {
    return false;
  }

  for (let i = 0; i <= tokens.length - sequence.length; i += 1) {
    let matched = true;
    for (let j = 0; j < sequence.length; j += 1) {
      if (tokens[i + j] !== sequence[j]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return true;
    }
  }

  return false;
};

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

    const bodyTokens = declaration.bodyTokens.map((token) => token.toLowerCase());
    if (!hasTokenSequence(bodyTokens, ["local", "as"])) {
      diagnostics.push(
        createProtocolDiagnostic(
          "protocol/bgp-missing-local-as",
          `BGP 协议 '${declaration.name}' 缺少 local as 配置`,
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

    const bodyTokens = declaration.bodyTokens.map((token) => token.toLowerCase());
    if (!bodyTokens.includes("neighbor")) {
      diagnostics.push(
        createProtocolDiagnostic(
          "protocol/bgp-missing-neighbor",
          `BGP 协议 '${declaration.name}' 缺少 neighbor 配置`,
          declaration,
        ),
      );
    }
  }

  return diagnostics;
};

const defaultRules: BirdRule[] = [bgpLocalAsRule, bgpNeighborRule];

export const lintBirdConfig = (text: string): LintResult => {
  const parsed = parseBirdConfig(text);
  const core = buildCoreSnapshotFromParsed(parsed);
  const context: RuleContext = { text, parsed, core };

  const ruleDiagnostics = defaultRules.flatMap((rule) => rule(context));

  return {
    parsed,
    core,
    diagnostics: [...core.diagnostics, ...ruleDiagnostics],
  };
};
