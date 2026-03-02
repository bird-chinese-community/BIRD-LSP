import type { BirdDiagnostic } from "@birdcc/core";
import type {
  ChannelEntry,
  ChannelExportEntry,
  ChannelImportEntry,
  ProtocolDeclaration,
  SourceRange,
} from "@birdcc/parser";
import {
  createRuleDiagnostic,
  eachFilterBodyExpression,
  extractFunctionCalls,
  filterDeclarations,
  findTemplateByName,
  functionDeclarations,
  hasSymbolKind,
  normalizeClause,
  pushUniqueDiagnostic,
  protocolDeclarations,
  tableDeclarations,
  type BirdRule,
} from "./shared.js";

const normalizeProtocolFamily = (text: string): string =>
  normalizeClause(text).split(" ")[0] ?? "";
const BUILTIN_FILTER_NAMES = new Set([
  "all",
  "none",
  "accept",
  "reject",
  "announce",
]);
const BUILTIN_FUNCTION_NAMES = new Set([
  "net",
  "bgp_path",
  "bgp_community",
  "bgp_ext_community",
  "bgp_large_community",
  "bgp_origin",
  "defined",
  "len",
  "match",
  "route_source",
  "roa_check",
  "prefix",
  "ip",
  "int",
]);

const isImportOrExportFilterClause = (
  value: unknown,
): value is {
  mode: "filter";
  filterName?: string;
  filterNameRange?: SourceRange;
} => {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (value as { mode?: string }).mode === "filter";
};

const isChannelFilterClause = (
  entry: ChannelEntry,
): entry is ChannelImportEntry | ChannelExportEntry =>
  (entry.kind === "import" || entry.kind === "export") &&
  entry.mode === "filter";

const collectProtocolFilterClauses = (
  declaration: ProtocolDeclaration,
): Array<{ filterName?: string; range: SourceRange }> => {
  const clauses: Array<{ filterName?: string; range: SourceRange }> = [];

  for (const statement of declaration.statements) {
    if (isImportOrExportFilterClause(statement)) {
      clauses.push({
        filterName: statement.filterName,
        range: statement.filterNameRange ?? statement,
      });
      continue;
    }

    if (statement.kind !== "channel") {
      continue;
    }

    for (const entry of statement.entries) {
      if (!isChannelFilterClause(entry)) {
        continue;
      }

      clauses.push({
        filterName: entry.filterName,
        range: entry.filterNameRange ?? entry,
      });
    }
  }

  return clauses;
};

const symProtoTypeMismatchRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];
  const seen = new Set<string>();

  for (const declaration of protocolDeclarations(parsed)) {
    if (!declaration.fromTemplate) {
      continue;
    }

    const template = findTemplateByName(parsed, declaration.fromTemplate);
    if (!template) {
      continue;
    }

    const protocolFamily = normalizeProtocolFamily(declaration.protocolType);
    const templateFamily = normalizeProtocolFamily(template.templateType);
    if (
      protocolFamily.length === 0 ||
      templateFamily.length === 0 ||
      protocolFamily === templateFamily
    ) {
      continue;
    }

    pushUniqueDiagnostic(
      diagnostics,
      seen,
      createRuleDiagnostic(
        "sym/proto-type-mismatch",
        `Protocol '${declaration.name}' (${declaration.protocolType}) cannot use template '${template.name}' (${template.templateType})`,
        declaration.fromTemplateRange ?? declaration.nameRange,
      ),
    );
  }

  return diagnostics;
};

const symFilterRequiredRule: BirdRule = ({ parsed, core }) => {
  const diagnostics: BirdDiagnostic[] = [];
  const seen = new Set<string>();
  const filterNames = new Set(
    filterDeclarations(parsed).map((item) => item.name.toLowerCase()),
  );

  for (const declaration of protocolDeclarations(parsed)) {
    for (const clause of collectProtocolFilterClauses(declaration)) {
      const name = clause.filterName?.trim();
      if (!name) {
        pushUniqueDiagnostic(
          diagnostics,
          seen,
          createRuleDiagnostic(
            "sym/filter-required",
            `Protocol '${declaration.name}' requires a filter name in import/export filter clause`,
            clause.range,
          ),
        );
        continue;
      }

      const loweredName = name.toLowerCase();
      if (
        !filterNames.has(loweredName) &&
        !hasSymbolKind(core, "filter", name)
      ) {
        if (BUILTIN_FILTER_NAMES.has(loweredName)) {
          continue;
        }

        pushUniqueDiagnostic(
          diagnostics,
          seen,
          createRuleDiagnostic(
            "sym/filter-required",
            `Protocol '${declaration.name}' references unknown filter '${name}'`,
            clause.range,
          ),
        );
      }
    }
  }

  return diagnostics;
};

const symFunctionRequiredRule: BirdRule = ({ parsed, core }) => {
  const diagnostics: BirdDiagnostic[] = [];
  const seen = new Set<string>();
  const functions = new Set(
    functionDeclarations(parsed).map((item) => item.name.toLowerCase()),
  );
  for (const builtin of BUILTIN_FUNCTION_NAMES) {
    functions.add(builtin);
  }

  for (const { statement, declarationName } of eachFilterBodyExpression(
    parsed,
  )) {
    const textParts: string[] = [];
    if (statement.kind === "expression") {
      textParts.push(statement.expressionText);
    }
    if (statement.kind === "other") {
      textParts.push(statement.text);
    }
    if (statement.kind === "if" && statement.conditionText) {
      textParts.push(statement.conditionText);
    }

    if (textParts.length === 0) {
      continue;
    }

    const joined = textParts.join(" ");
    for (const callName of extractFunctionCalls(joined)) {
      if (
        functions.has(callName.toLowerCase()) ||
        hasSymbolKind(core, "function", callName)
      ) {
        continue;
      }

      pushUniqueDiagnostic(
        diagnostics,
        seen,
        createRuleDiagnostic(
          "sym/function-required",
          `Declaration '${declarationName}' references undefined function '${callName}'`,
          statement,
        ),
      );
    }
  }

  return diagnostics;
};

const symTableRequiredRule: BirdRule = ({ parsed, core }) => {
  const diagnostics: BirdDiagnostic[] = [];
  const seen = new Set<string>();
  const tableNames = new Set(
    tableDeclarations(parsed).map((item) => item.name.toLowerCase()),
  );

  for (const declaration of protocolDeclarations(parsed)) {
    for (const statement of declaration.statements) {
      if (statement.kind === "channel") {
        for (const entry of statement.entries) {
          if (entry.kind !== "table") {
            continue;
          }

          const tableName = entry.tableName.trim();
          if (!tableName) {
            pushUniqueDiagnostic(
              diagnostics,
              seen,
              createRuleDiagnostic(
                "sym/table-required",
                `Protocol '${declaration.name}' requires a table name in channel table clause`,
                entry,
              ),
            );
            continue;
          }

          if (
            !tableNames.has(tableName.toLowerCase()) &&
            !hasSymbolKind(core, "table", tableName)
          ) {
            pushUniqueDiagnostic(
              diagnostics,
              seen,
              createRuleDiagnostic(
                "sym/table-required",
                `Protocol '${declaration.name}' references unknown table '${tableName}'`,
                entry.tableNameRange,
              ),
            );
          }
        }
      }

      if (statement.kind !== "other") {
        continue;
      }

      const text = statement.text;
      const matched = text.match(/\btable\b(?:\s+([A-Za-z_][A-Za-z0-9_]*))?/i);
      if (!matched) {
        continue;
      }

      const tableName = matched[1]?.trim();
      if (!tableName) {
        pushUniqueDiagnostic(
          diagnostics,
          seen,
          createRuleDiagnostic(
            "sym/table-required",
            `Protocol '${declaration.name}' requires table name after 'table'`,
            statement,
          ),
        );
        continue;
      }

      if (
        !tableNames.has(tableName.toLowerCase()) &&
        !hasSymbolKind(core, "table", tableName)
      ) {
        pushUniqueDiagnostic(
          diagnostics,
          seen,
          createRuleDiagnostic(
            "sym/table-required",
            `Protocol '${declaration.name}' references unknown table '${tableName}'`,
            statement,
          ),
        );
      }
    }
  }

  return diagnostics;
};

export const symRules: BirdRule[] = [
  symProtoTypeMismatchRule,
  symFilterRequiredRule,
  symFunctionRequiredRule,
  symTableRequiredRule,
];

export const collectSymRuleDiagnostics = (
  context: Parameters<BirdRule>[0],
): BirdDiagnostic[] => {
  return symRules.flatMap((rule) => rule(context));
};
