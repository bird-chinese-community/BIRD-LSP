import { isIP } from "node:net";
import { buildCoreSnapshotFromParsed, type BirdDiagnostic, type CoreSnapshot } from "@birdcc/core";
import {
  parseBirdConfig,
  type ParsedBirdDocument,
  type ProtocolDeclaration,
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

      for (const line of [...groupedByLine.keys()].sort((a, b) => a - b)) {
        const grouped = groupedByLine.get(line);
        if (!grouped) {
          continue;
        }

        const clause = grouped.parts.join(" ").replace(/\s+/g, " ").trim();
        if (!/^next\s+hop\b/i.test(clause)) {
          continue;
        }

        const value = clause.replace(/^next\s+hop\s*/i, "").trim();
        const lowered = value.toLowerCase();
        const ipv4OrIpv6Prefixed =
          lowered.startsWith("ipv4 ") || lowered.startsWith("ipv6 ") ? value.slice(5).trim() : null;
        const isValidValue =
          lowered === "self" ||
          lowered === "address" ||
          lowered === "keep" ||
          lowered === "prefer global" ||
          lowered === "prefer local" ||
          isIP(value) !== 0 ||
          (ipv4OrIpv6Prefixed !== null && isIP(ipv4OrIpv6Prefixed) !== 0);

        if (isValidValue) {
          continue;
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

const defaultRules: BirdRule[] = [
  bgpLocalAsRule,
  bgpNeighborRule,
  ospfAreaRequiredRule,
  bgpNextHopFormRule,
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
