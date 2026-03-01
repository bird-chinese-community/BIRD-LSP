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

/** Runs parser + core + normalized 32-rule linter pipeline and returns merged diagnostics. */
export const lintBirdConfig = async (text: string): Promise<LintResult> => {
  const parsed = await parseBirdConfig(text);
  const core = buildCoreSnapshotFromParsed(parsed);

  const context: RuleContext = { text, parsed, core };

  const normalizedBaseDiagnostics = normalizeBaseDiagnostics(parsed, core.diagnostics);
  const ruleDiagnostics: BirdDiagnostic[] = [
    ...collectSymRuleDiagnostics(context),
    ...collectCfgRuleDiagnostics(context),
    ...collectNetRuleDiagnostics(context),
    ...collectTypeRuleDiagnostics(context),
    ...collectBgpRuleDiagnostics(context),
    ...collectOspfRuleDiagnostics(context),
  ];

  return {
    parsed,
    core,
    diagnostics: dedupeDiagnostics([...normalizedBaseDiagnostics, ...ruleDiagnostics]),
  };
};
