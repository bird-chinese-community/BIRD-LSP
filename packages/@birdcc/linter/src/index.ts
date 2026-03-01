import type { CrossFileResolutionResult, SymbolTable } from "@birdcc/core";
import { buildCoreSnapshotFromParsed, type BirdDiagnostic, type CoreSnapshot } from "@birdcc/core";
import { parseBirdConfig, type ParsedBirdDocument } from "@birdcc/parser";
import { collectBgpRuleDiagnostics } from "./rules/bgp.js";
import { collectCfgRuleDiagnostics } from "./rules/cfg.js";
import { collectNetRuleDiagnostics } from "./rules/net.js";
import { normalizeBaseDiagnostics } from "./rules/normalize.js";
import { collectOspfRuleDiagnostics } from "./rules/ospf.js";
import { collectSymRuleDiagnostics } from "./rules/sym.js";
import { type RuleContext } from "./rules/shared.js";
import { collectTypeRuleDiagnostics } from "./rules/type.js";

export interface LintResult {
  parsed: ParsedBirdDocument;
  core: CoreSnapshot;
  diagnostics: BirdDiagnostic[];
}

const dedupeDiagnostics = (diagnostics: BirdDiagnostic[]): BirdDiagnostic[] => {
  const seen = new Set<string>();
  const output: BirdDiagnostic[] = [];

  for (const diagnostic of diagnostics) {
    const key = [
      diagnostic.code,
      diagnostic.message,
      diagnostic.uri ?? "",
      diagnostic.range.line,
      diagnostic.range.column,
      diagnostic.range.endLine,
      diagnostic.range.endColumn,
    ].join(":");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(diagnostic);
  }

  return output;
};

const diagnosticsForUri = (
  diagnostics: BirdDiagnostic[],
  uri: string,
  entryUri: string,
): BirdDiagnostic[] => {
  return diagnostics.filter((diagnostic) => (diagnostic.uri ?? entryUri) === uri);
};

const createMergedCoreSnapshot = (
  localCore: CoreSnapshot,
  mergedSymbolTable: SymbolTable,
  scopedDiagnostics: BirdDiagnostic[],
): CoreSnapshot => ({
  ...localCore,
  symbols: mergedSymbolTable.definitions,
  references: mergedSymbolTable.references,
  symbolTable: mergedSymbolTable,
  diagnostics: scopedDiagnostics,
});

export interface LintBirdConfigOptions {
  parsed?: ParsedBirdDocument;
  core?: CoreSnapshot;
  uri?: string;
}

export interface CrossFileLintResult {
  diagnostics: BirdDiagnostic[];
  byUri: Record<string, LintResult>;
}

/** Runs parser + core + normalized 32-rule linter pipeline and returns merged diagnostics. */
export const lintBirdConfig = async (
  text: string,
  options: LintBirdConfigOptions = {},
): Promise<LintResult> => {
  const parsed = options.parsed ?? (await parseBirdConfig(text));
  const core = options.core ?? buildCoreSnapshotFromParsed(parsed, { uri: options.uri });

  const context: RuleContext = { text, parsed, core };

  const normalizedBaseDiagnostics = normalizeBaseDiagnostics(parsed, core.diagnostics, {
    uri: options.uri,
  });
  const ruleDiagnostics: BirdDiagnostic[] = [
    ...collectSymRuleDiagnostics(context),
    ...collectCfgRuleDiagnostics(context),
    ...collectNetRuleDiagnostics(context),
    ...collectTypeRuleDiagnostics(context),
    ...collectBgpRuleDiagnostics(context),
    ...collectOspfRuleDiagnostics(context),
  ].map((diagnostic) => ({
    ...diagnostic,
    uri: diagnostic.uri ?? options.uri,
  }));

  return {
    parsed,
    core,
    diagnostics: dedupeDiagnostics([...normalizedBaseDiagnostics, ...ruleDiagnostics]),
  };
};

export const lintResolvedCrossFileGraph = async (
  resolution: CrossFileResolutionResult,
): Promise<CrossFileLintResult> => {
  const byUri: Record<string, LintResult> = {};
  const diagnostics: BirdDiagnostic[] = [];
  const uris = resolution.visitedUris.length > 0 ? resolution.visitedUris : [resolution.entryUri];

  for (const uri of uris) {
    const text = resolution.documents[uri];
    const localCore = resolution.snapshots[uri];
    if (!text || !localCore) {
      continue;
    }

    const lintResult = await lintBirdConfig(text, {
      uri,
      core: createMergedCoreSnapshot(
        localCore,
        resolution.symbolTable,
        diagnosticsForUri(resolution.diagnostics, uri, resolution.entryUri),
      ),
    });
    byUri[uri] = lintResult;
    diagnostics.push(...lintResult.diagnostics);
  }

  return {
    byUri,
    diagnostics: dedupeDiagnostics(diagnostics),
  };
};
