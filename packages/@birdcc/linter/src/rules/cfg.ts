import { isIP } from "node:net";
import type { BirdDiagnostic } from "@birdcc/core";
import type { SourceRange } from "@birdcc/parser";
import {
  channelOtherEntries,
  createProtocolDiagnostic,
  createRuleDiagnostic,
  extractFirstNumberAfterKeyword,
  hasBooleanValue,
  isProtocolType,
  numericValue,
  protocolDeclarations,
  pushUniqueDiagnostic,
  routerIdDeclarations,
  templateDeclarations,
  type BirdRule,
} from "./shared.js";

const MAX_ASN = 4_294_967_294;
const MAX_ROUTE_LIMIT = 10_000_000;

const cfgNoProtocolRule: BirdRule = ({ parsed }) => {
  if (protocolDeclarations(parsed).length > 0) {
    return [];
  }

  return [
    createRuleDiagnostic(
      "cfg/no-protocol",
      "No protocol is specified in configuration",
      {
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 1,
      },
    ),
  ];
};

const cfgMissingRouterIdRule: BirdRule = ({ parsed }) => {
  if (routerIdDeclarations(parsed).length > 0) {
    return [];
  }

  return [
    createRuleDiagnostic(
      "cfg/missing-router-id",
      "Router ID must be configured",
      {
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 1,
      },
    ),
  ];
};

const diagnoseNumberExpected = (
  diagnostics: BirdDiagnostic[],
  seen: Set<string>,
  range: SourceRange,
  declarationName: string,
  fieldName: string,
  value: string | undefined,
): void => {
  if (value === undefined) {
    return;
  }

  if (numericValue(value) !== null) {
    return;
  }

  pushUniqueDiagnostic(
    diagnostics,
    seen,
    createRuleDiagnostic(
      "cfg/number-expected",
      `Protocol '${declarationName}' expects numeric value for '${fieldName}'`,
      range,
    ),
  );
};

const diagnoseValueOutOfRange = (
  diagnostics: BirdDiagnostic[],
  seen: Set<string>,
  range: SourceRange,
  declarationName: string,
  fieldName: string,
  value: number | null,
  min: number,
  max: number,
): void => {
  if (value === null) {
    return;
  }

  if (value >= min && value <= max) {
    return;
  }

  pushUniqueDiagnostic(
    diagnostics,
    seen,
    createRuleDiagnostic(
      "cfg/value-out-of-range",
      `Protocol '${declarationName}' has out-of-range value for '${fieldName}': ${value}`,
      range,
    ),
  );
};

const cfgNumericRules: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];
  const seen = new Set<string>();

  for (const declaration of protocolDeclarations(parsed)) {
    for (const statement of declaration.statements) {
      if (statement.kind === "local-as") {
        diagnoseNumberExpected(
          diagnostics,
          seen,
          statement.asnRange,
          declaration.name,
          "local as",
          statement.asn,
        );
        diagnoseValueOutOfRange(
          diagnostics,
          seen,
          statement.asnRange,
          declaration.name,
          "local as",
          numericValue(statement.asn),
          1,
          MAX_ASN,
        );
      }

      if (statement.kind === "neighbor" && statement.asnRange) {
        diagnoseNumberExpected(
          diagnostics,
          seen,
          statement.asnRange,
          declaration.name,
          "neighbor as",
          statement.asn,
        );
        diagnoseValueOutOfRange(
          diagnostics,
          seen,
          statement.asnRange,
          declaration.name,
          "neighbor as",
          numericValue(statement.asn),
          1,
          MAX_ASN,
        );
      }

      if (statement.kind === "other") {
        const lowerText = statement.text.toLowerCase();

        const holdNumber = extractFirstNumberAfterKeyword(lowerText, "hold");
        if (holdNumber === null && /\bhold\b/.test(lowerText)) {
          diagnoseNumberExpected(
            diagnostics,
            seen,
            statement,
            declaration.name,
            "hold",
            "",
          );
        }
        diagnoseValueOutOfRange(
          diagnostics,
          seen,
          statement,
          declaration.name,
          "hold",
          holdNumber,
          3,
          65_535,
        );

        const keepaliveNumber = extractFirstNumberAfterKeyword(
          lowerText,
          "keepalive",
        );
        if (keepaliveNumber === null && /\bkeepalive\b/.test(lowerText)) {
          diagnoseNumberExpected(
            diagnostics,
            seen,
            statement,
            declaration.name,
            "keepalive",
            "",
          );
        }
        diagnoseValueOutOfRange(
          diagnostics,
          seen,
          statement,
          declaration.name,
          "keepalive",
          keepaliveNumber,
          1,
          65_535,
        );

        const ttlNumber = extractFirstNumberAfterKeyword(lowerText, "ttl");
        if (ttlNumber === null && /\bttl\b/.test(lowerText)) {
          diagnoseNumberExpected(
            diagnostics,
            seen,
            statement,
            declaration.name,
            "ttl",
            "",
          );
        }
        diagnoseValueOutOfRange(
          diagnostics,
          seen,
          statement,
          declaration.name,
          "ttl",
          ttlNumber,
          1,
          255,
        );
      }

      if (statement.kind !== "channel") {
        continue;
      }

      for (const entry of statement.entries) {
        if (entry.kind === "limit") {
          diagnoseNumberExpected(
            diagnostics,
            seen,
            entry.valueRange,
            declaration.name,
            "limit",
            entry.value,
          );
          diagnoseValueOutOfRange(
            diagnostics,
            seen,
            entry.valueRange,
            declaration.name,
            "limit",
            numericValue(entry.value),
            0,
            MAX_ROUTE_LIMIT,
          );
        }

        if (entry.kind !== "other") {
          continue;
        }

        const maxPrefixMatch = entry.text.match(/\bmax\s+prefix\s+([^;\s]+)/i);
        if (!maxPrefixMatch) {
          continue;
        }

        const token = maxPrefixMatch[1] ?? "";
        diagnoseNumberExpected(
          diagnostics,
          seen,
          entry,
          declaration.name,
          "max prefix",
          token,
        );
        diagnoseValueOutOfRange(
          diagnostics,
          seen,
          entry,
          declaration.name,
          "max prefix",
          numericValue(token),
          0,
          MAX_ROUTE_LIMIT,
        );
      }
    }
  }

  return diagnostics;
};

const cfgSwitchValueExpectedRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];
  const seen = new Set<string>();
  const switchPattern =
    /\b(passive|stub|bfd|enabled|disabled|check\s+link|deterministic\s+med)\b\s+([^;\s]+)/i;

  for (const declaration of protocolDeclarations(parsed)) {
    for (const statement of declaration.statements) {
      if (statement.kind === "other") {
        const matched = statement.text.match(switchPattern);
        if (matched) {
          const token = matched[2] ?? "";
          if (!hasBooleanValue(token)) {
            pushUniqueDiagnostic(
              diagnostics,
              seen,
              createRuleDiagnostic(
                "cfg/switch-value-expected",
                `Protocol '${declaration.name}' expects boolean value for '${matched[1]}'`,
                statement,
              ),
            );
          }
        }
      }

      if (statement.kind !== "channel") {
        continue;
      }

      for (const entry of statement.entries) {
        if (entry.kind !== "keep-filtered") {
          continue;
        }

        if (hasBooleanValue(entry.value)) {
          continue;
        }

        pushUniqueDiagnostic(
          diagnostics,
          seen,
          createRuleDiagnostic(
            "cfg/switch-value-expected",
            `Protocol '${declaration.name}' expects boolean value for keep filtered`,
            entry.valueRange,
          ),
        );
      }
    }
  }

  return diagnostics;
};

const extractIps = (text: string): string[] => {
  const parts = text
    .split(/[^0-9A-Fa-f:./]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  const values: string[] = [];
  for (const part of parts) {
    const candidate = part.includes("/") ? (part.split("/")[0] ?? "") : part;
    if (isIP(candidate) !== 0) {
      values.push(candidate);
    }
  }

  return values;
};

const cfgIpNetworkMismatchRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];
  const seen = new Set<string>();

  for (const declaration of protocolDeclarations(parsed)) {
    for (const entry of channelOtherEntries(declaration)) {
      if (entry.channelType !== "ipv4" && entry.channelType !== "ipv6") {
        continue;
      }

      for (const value of extractIps(entry.text)) {
        const family = isIP(value);
        if (
          (entry.channelType === "ipv4" && family === 4) ||
          (entry.channelType === "ipv6" && family === 6)
        ) {
          continue;
        }

        pushUniqueDiagnostic(
          diagnostics,
          seen,
          createRuleDiagnostic(
            "cfg/ip-network-mismatch",
            `Protocol '${declaration.name}' channel '${entry.channelType}' contains mismatched address '${value}'`,
            entry.range,
          ),
        );
      }
    }
  }

  return diagnostics;
};

const cfgIncompatibleTypeRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];
  const seen = new Set<string>();

  for (const declaration of protocolDeclarations(parsed)) {
    for (const statement of declaration.statements) {
      if (statement.kind === "neighbor" && statement.addressKind !== "ip") {
        pushUniqueDiagnostic(
          diagnostics,
          seen,
          createRuleDiagnostic(
            "cfg/incompatible-type",
            `Protocol '${declaration.name}' neighbor address must be an IP literal`,
            statement.addressRange,
          ),
        );
      }

      if (
        statement.kind === "other" &&
        /\brouter\s+id\s+\S+/i.test(statement.text)
      ) {
        const matched = statement.text.match(/\brouter\s+id\s+([^;\s]+)/i);
        const value = matched?.[1] ?? "";
        if (value && isIP(value) !== 4) {
          pushUniqueDiagnostic(
            diagnostics,
            seen,
            createRuleDiagnostic(
              "cfg/incompatible-type",
              `Router id '${value}' must be IPv4`,
              statement,
            ),
          );
        }
      }
    }
  }

  return diagnostics;
};

const hasTemplateCycleFrom = (
  start: string,
  graph: Map<string, string>,
): boolean => {
  const path = new Set<string>();
  let current = start;
  let hops = 0;
  const maxHops = graph.size + 1;

  while (current.length > 0) {
    if (path.has(current)) {
      return true;
    }

    path.add(current);
    current = graph.get(current) ?? "";
    hops += 1;

    if (hops > maxHops) {
      return true;
    }
  }

  return false;
};

const cfgCircularTemplateRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];
  const seen = new Set<string>();
  const templates = templateDeclarations(parsed);
  if (templates.length === 0) {
    return diagnostics;
  }

  const graph = new Map<string, string>();
  const ranges = new Map<string, SourceRange>();

  for (const template of templates) {
    const name = template.name.toLowerCase();
    ranges.set(name, template.nameRange);
    if (template.fromTemplate) {
      graph.set(name, template.fromTemplate.toLowerCase());
    }
  }

  for (const template of templates) {
    const name = template.name.toLowerCase();
    if (!hasTemplateCycleFrom(name, graph)) {
      continue;
    }

    const range = ranges.get(name) ?? template.nameRange;
    pushUniqueDiagnostic(
      diagnostics,
      seen,
      createRuleDiagnostic(
        "cfg/circular-template",
        `Template '${template.name}' is in a circular inheritance chain`,
        range,
      ),
    );
  }

  return diagnostics;
};

const cfgProtocolSpecificHintRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];
  const seen = new Set<string>();

  for (const declaration of protocolDeclarations(parsed)) {
    if (!isProtocolType(declaration, "bgp")) {
      continue;
    }

    for (const statement of declaration.statements) {
      if (statement.kind !== "other") {
        continue;
      }

      if (!/\bneighbor\s+\S+\s+as\s+[^0-9\s;]+/i.test(statement.text)) {
        continue;
      }

      pushUniqueDiagnostic(
        diagnostics,
        seen,
        createProtocolDiagnostic(
          "cfg/number-expected",
          `Protocol '${declaration.name}' expects numeric ASN in neighbor statement`,
          declaration,
          "error",
        ),
      );
    }
  }

  return diagnostics;
};

export const cfgRules: BirdRule[] = [
  cfgNoProtocolRule,
  cfgMissingRouterIdRule,
  cfgNumericRules,
  cfgSwitchValueExpectedRule,
  cfgIpNetworkMismatchRule,
  cfgIncompatibleTypeRule,
  cfgCircularTemplateRule,
  cfgProtocolSpecificHintRule,
];

export const collectCfgRuleDiagnostics = (
  context: Parameters<BirdRule>[0],
): BirdDiagnostic[] => {
  return cfgRules.flatMap((rule) => rule(context));
};
