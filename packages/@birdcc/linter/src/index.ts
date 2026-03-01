import { isIP } from "node:net";
import { buildCoreSnapshotFromParsed, type BirdDiagnostic, type CoreSnapshot } from "@birdcc/core";
import {
  parseBirdConfig,
  type FilterDeclaration,
  type ParsedBirdDocument,
  type ProtocolDeclaration,
  type ProtocolStatement,
  type SourceRange,
} from "@birdcc/parser";

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

const createRangeDiagnostic = (
  code: string,
  message: string,
  range: SourceRange,
): BirdDiagnostic => ({
  code,
  message,
  severity: "warning",
  source: "linter",
  range: {
    line: range.line,
    column: range.column,
    endLine: range.endLine,
    endColumn: range.endColumn,
  },
});

const normalizeClause = (text: string): string => text.trim().replace(/\s+/g, " ").toLowerCase();
const VALID_BGP_NEXT_HOP_KEYWORDS = new Set([
  "self",
  "address",
  "keep",
  "prefer global",
  "prefer local",
]);

const isBgpProtocol = (declaration: ProtocolDeclaration): boolean =>
  declaration.protocolType.toLowerCase() === "bgp";

const isOspfProtocol = (declaration: ProtocolDeclaration): boolean =>
  declaration.protocolType.toLowerCase() === "ospf";

const protocolDeclarations = (parsed: ParsedBirdDocument): ProtocolDeclaration[] =>
  parsed.program.declarations.filter(
    (declaration): declaration is ProtocolDeclaration => declaration.kind === "protocol",
  );

const filterDeclarations = (parsed: ParsedBirdDocument): FilterDeclaration[] =>
  parsed.program.declarations.filter(
    (declaration): declaration is FilterDeclaration => declaration.kind === "filter",
  );

const PROTOCOL_STATEMENT_WHITELISTS: Record<string, Set<string>> = {
  bgp: new Set([
    "local as",
    "neighbor",
    "import",
    "export",
    "channel",
    "next hop",
    "password",
    "authentication",
    "md5",
    "multihop",
    "source",
    "hold",
    "keepalive",
    "graceful",
    "gateway",
    "ttl",
    "bfd",
    "rr",
    "route",
  ]),
  ospf: new Set(["area", "interface", "import", "export", "channel", "stub"]),
  static: new Set(["route", "import", "export", "channel", "preference", "check"]),
  direct: new Set(["interface", "import", "export", "channel", "check", "preference"]),
};

const statementKey = (statement: ProtocolStatement): string | null => {
  if (statement.kind === "local-as") {
    return "local as";
  }

  if (
    statement.kind === "neighbor" ||
    statement.kind === "import" ||
    statement.kind === "export" ||
    statement.kind === "channel"
  ) {
    return statement.kind;
  }

  const normalized = normalizeClause(statement.text).replace(/;$/, "");
  if (normalized.length === 0) {
    return null;
  }

  if (normalized.startsWith("local as ")) {
    return "local as";
  }

  if (normalized.startsWith("next hop ")) {
    return "next hop";
  }

  if (normalized.startsWith("peer table ")) {
    return "peer table";
  }

  if (normalized.startsWith("router id ")) {
    return "router id";
  }

  const [firstToken] = normalized.split(" ");
  return firstToken ?? null;
};

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

const bgpNextHopFormRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const declaration of protocolDeclarations(parsed)) {
    if (!isBgpProtocol(declaration)) {
      continue;
    }

    for (const statement of declaration.statements) {
      if (statement.kind === "other") {
        const clause = statement.text.trim().replace(/\s+/g, " ");
        if (/^next\s+hop\b/i.test(clause)) {
          diagnostics.push(
            createRangeDiagnostic(
              "protocol/bgp-next-hop-form",
              `BGP protocol '${declaration.name}' has next hop statement outside channel block`,
              statement,
            ),
          );
        }
        continue;
      }

      if (statement.kind !== "channel") {
        continue;
      }

      const groupedByLine = new Map<
        number,
        {
          parts: string[];
          start: SourceRange;
          end: SourceRange;
        }
      >();

      for (const entry of statement.entries) {
        if (entry.kind !== "other") {
          continue;
        }

        const token = entry.text.trim();
        if (token.length === 0) {
          continue;
        }

        const existing = groupedByLine.get(entry.line);
        if (existing) {
          existing.parts.push(token);
          existing.end = entry;
          continue;
        }

        groupedByLine.set(entry.line, {
          parts: [token],
          start: entry,
          end: entry,
        });
      }

      for (const [, grouped] of [...groupedByLine.entries()].sort(([a], [b]) => a - b)) {
        const clause = grouped.parts.join(" ").replace(/\s+/g, " ").trim();
        if (!/^next\s+hop\b/i.test(clause)) {
          continue;
        }

        const value = clause.replace(/^next\s+hop\s*/i, "").trim();
        const lowered = value.toLowerCase();
        if (VALID_BGP_NEXT_HOP_KEYWORDS.has(lowered)) {
          continue;
        }

        if (isIP(value) !== 0) {
          continue;
        }

        if (lowered.startsWith("ipv4 ") || lowered.startsWith("ipv6 ")) {
          const ipPart = value.slice(5).trim();
          if (isIP(ipPart) !== 0) {
            continue;
          }
        }

        diagnostics.push(
          createRangeDiagnostic(
            "protocol/bgp-next-hop-form",
            `BGP protocol '${declaration.name}' has invalid next hop form '${clause}'`,
            {
              line: grouped.start.line,
              column: grouped.start.column,
              endLine: grouped.end.endLine,
              endColumn: grouped.end.endColumn,
            },
          ),
        );
      }
    }
  }

  return diagnostics;
};

const invalidStatementInProtocolRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const declaration of protocolDeclarations(parsed)) {
    const whitelist = PROTOCOL_STATEMENT_WHITELISTS[declaration.protocolType.toLowerCase()];
    if (!whitelist) {
      continue;
    }

    for (const statement of declaration.statements) {
      const key = statementKey(statement);
      if (!key || whitelist.has(key)) {
        continue;
      }

      const snippet = statement.kind === "other" ? normalizeClause(statement.text) : key;
      diagnostics.push(
        createRangeDiagnostic(
          "structure/invalid-statement-in-protocol",
          `Protocol '${declaration.name}' (${declaration.protocolType}) contains invalid statement '${snippet}'`,
          statement,
        ),
      );
    }
  }

  return diagnostics;
};

const missingAuthenticationRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];
  const authenticationPattern = /\b(password|authentication|md5|key)\b/i;

  for (const declaration of protocolDeclarations(parsed)) {
    if (!isBgpProtocol(declaration)) {
      continue;
    }

    let hasAuthentication = false;
    for (const statement of declaration.statements) {
      if (statement.kind === "other" && authenticationPattern.test(statement.text)) {
        hasAuthentication = true;
        break;
      }

      if (statement.kind !== "channel") {
        continue;
      }

      for (const entry of statement.entries) {
        if (entry.kind === "other" && authenticationPattern.test(entry.text)) {
          hasAuthentication = true;
          break;
        }
      }

      if (hasAuthentication) {
        break;
      }
    }

    if (hasAuthentication) {
      continue;
    }

    diagnostics.push(
      createProtocolDiagnostic(
        "security/missing-authentication",
        `BGP protocol '${declaration.name}' missing authentication configuration`,
        declaration,
      ),
    );
  }

  return diagnostics;
};

const PERFORMANCE_THRESHOLDS = {
  maxStatements: 50,
  maxMatchOperators: 20,
  maxExpressionLength: 500,
  maxIfStatements: 10,
};

const largeFilterExpressionRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const declaration of filterDeclarations(parsed)) {
    const statementCount = declaration.statements.length;
    const matchCount = declaration.matches.length;
    const ifCount = declaration.statements.filter((statement) => statement.kind === "if").length;
    const maxExpressionLength = declaration.statements.reduce((maxValue, statement) => {
      if (statement.kind === "expression") {
        return Math.max(maxValue, statement.expressionText.length);
      }
      if (statement.kind === "other") {
        return Math.max(maxValue, statement.text.length);
      }
      if (statement.kind === "if") {
        return Math.max(maxValue, statement.conditionText?.length ?? 0);
      }
      return maxValue;
    }, 0);

    const exceeded: string[] = [];
    if (statementCount > PERFORMANCE_THRESHOLDS.maxStatements) {
      exceeded.push(`statements=${statementCount}`);
    }
    if (matchCount > PERFORMANCE_THRESHOLDS.maxMatchOperators) {
      exceeded.push(`matches=${matchCount}`);
    }
    if (maxExpressionLength > PERFORMANCE_THRESHOLDS.maxExpressionLength) {
      exceeded.push(`max-expression-length=${maxExpressionLength}`);
    }
    if (ifCount > PERFORMANCE_THRESHOLDS.maxIfStatements) {
      exceeded.push(`if-statements=${ifCount}`);
    }

    if (exceeded.length === 0) {
      continue;
    }

    diagnostics.push(
      createRangeDiagnostic(
        "performance/large-filter-expression",
        `Filter '${declaration.name}' may be too complex (${exceeded.join(", ")})`,
        declaration.nameRange,
      ),
    );
  }

  return diagnostics;
};

const defaultRules: BirdRule[] = [
  bgpLocalAsRule,
  bgpNeighborRule,
  ospfAreaRequiredRule,
  bgpNextHopFormRule,
  invalidStatementInProtocolRule,
  missingAuthenticationRule,
  largeFilterExpressionRule,
];

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
