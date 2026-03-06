import type { CrossFileResolutionResult, SymbolTable } from "@birdcc/core";
import {
  buildCoreSnapshotFromParsed,
  type BirdDiagnostic,
  type CoreSnapshot,
} from "@birdcc/core";
import { parseBirdConfig, type ParsedBirdDocument } from "@birdcc/parser";
import { collectBgpRuleDiagnostics } from "./rules/bgp.js";
import { collectCfgRuleDiagnostics } from "./rules/cfg.js";
import { collectNetRuleDiagnostics } from "./rules/net.js";
import { normalizeBaseDiagnostics } from "./rules/normalize.js";
import { collectOspfRuleDiagnostics } from "./rules/ospf.js";
import { collectSymRuleDiagnostics } from "./rules/sym.js";
import {
  hasIncludeDeclarations,
  inferLintDocumentRole,
  type RuleContext,
} from "./rules/shared.js";
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
  return diagnostics.filter(
    (diagnostic) => (diagnostic.uri ?? entryUri) === uri,
  );
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

const CROSS_FILE_FRAGMENT_ONLY_CODES = new Set([
  "cfg/no-protocol",
  "cfg/missing-router-id",
]);

const FRAGMENT_OR_LIBRARY_EXTERNAL_CODES = new Set([
  "sym/undefined",
  "sym/function-required",
  "sym/filter-required",
  "sym/table-required",
  "cfg/no-protocol",
  "cfg/missing-router-id",
]);

const INCLUDE_TOLERANT_EXTERNAL_CODES = new Set([
  "sym/undefined",
  "sym/function-required",
  "sym/filter-required",
  "sym/table-required",
]);

const filterCrossFileFragmentDiagnostics = (
  uri: string,
  entryUri: string,
  diagnostics: BirdDiagnostic[],
): BirdDiagnostic[] => {
  if (uri === entryUri) {
    return diagnostics;
  }

  return diagnostics.filter(
    (diagnostic) => !CROSS_FILE_FRAGMENT_ONLY_CODES.has(diagnostic.code),
  );
};

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
  const core =
    options.core ?? buildCoreSnapshotFromParsed(parsed, { uri: options.uri });

  const context: RuleContext = { text, parsed, core, uri: options.uri };
  const role = inferLintDocumentRole(parsed, options.uri, text);

  const normalizedBaseDiagnostics = normalizeBaseDiagnostics(
    parsed,
    core.diagnostics,
    {
      uri: options.uri,
    },
  );
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

  const filterRoleDiagnostics = (
    diagnostics: BirdDiagnostic[],
  ): BirdDiagnostic[] => {
    let output = diagnostics;

    if (role === "fragment" || role === "library") {
      output = output.filter(
        (diagnostic) =>
          !FRAGMENT_OR_LIBRARY_EXTERNAL_CODES.has(diagnostic.code),
      );
    }

    if (hasIncludeDeclarations(parsed)) {
      output = output.filter(
        (diagnostic) => !INCLUDE_TOLERANT_EXTERNAL_CODES.has(diagnostic.code),
      );
    }

    return output;
  };

  return {
    parsed,
    core,
    diagnostics: dedupeDiagnostics([
      ...filterRoleDiagnostics(normalizedBaseDiagnostics),
      ...filterRoleDiagnostics(ruleDiagnostics),
    ]),
  };
};

export const lintResolvedCrossFileGraph = async (
  resolution: CrossFileResolutionResult,
): Promise<CrossFileLintResult> => {
  const byUri: Record<string, LintResult> = {};
  const diagnostics: BirdDiagnostic[] = [];
  const uris =
    resolution.visitedUris.length > 0
      ? resolution.visitedUris
      : [resolution.entryUri];

  const lintEntries = uris
    .map((uri) => {
      const text = resolution.documents[uri];
      const localCore = resolution.snapshots[uri];
      if (!text || !localCore) {
        return null;
      }

      return { uri, text, localCore };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const results = await Promise.all(
    lintEntries.map(async ({ uri, text, localCore }) => {
      const lintResult = await lintBirdConfig(text, {
        uri,
        core: createMergedCoreSnapshot(
          localCore,
          resolution.symbolTable,
          diagnosticsForUri(resolution.diagnostics, uri, resolution.entryUri),
        ),
      });
      return { uri, lintResult };
    }),
  );

  for (const { uri, lintResult } of results) {
    const scopedDiagnostics = filterCrossFileFragmentDiagnostics(
      uri,
      resolution.entryUri,
      lintResult.diagnostics,
    );
    byUri[uri] = {
      ...lintResult,
      diagnostics: scopedDiagnostics,
    };
    diagnostics.push(...scopedDiagnostics);
  }

  return {
    byUri,
    diagnostics: dedupeDiagnostics(diagnostics),
  };
};
