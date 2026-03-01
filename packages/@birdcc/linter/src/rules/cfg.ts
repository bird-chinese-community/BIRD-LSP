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
  routerIdDeclarations,
  templateDeclarations,
  type BirdRule,
} from "./shared.js";

const MAX_ASN = 4_294_967_295;

const pushUnique = (diagnostics: BirdDiagnostic[], diagnostic: BirdDiagnostic): void => {
  if (
    diagnostics.some(
      (item) =>
        item.code === diagnostic.code &&
        item.range.line === diagnostic.range.line &&
        item.range.column === diagnostic.range.column &&
        item.message === diagnostic.message,
    )
  ) {
    return;
  }

  diagnostics.push(diagnostic);
};

const cfgNoProtocolRule: BirdRule = ({ parsed }) => {
  if (protocolDeclarations(parsed).length > 0) {
    return [];
  }

  return [
    createRuleDiagnostic("cfg/no-protocol", "No protocol is specified in configuration", {
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 1,
    }),
  ];
};

const cfgMissingRouterIdRule: BirdRule = ({ parsed }) => {
  if (routerIdDeclarations(parsed).length > 0) {
    return [];
  }

  return [
    createRuleDiagnostic("cfg/missing-router-id", "Router ID must be configured", {
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 1,
    }),
  ];
};

const diagnoseNumberExpected = (
  diagnostics: BirdDiagnostic[],
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

  pushUnique(
    diagnostics,
    createRuleDiagnostic(
      "cfg/number-expected",
      `Protocol '${declarationName}' expects numeric value for '${fieldName}'`,
      range,
    ),
  );
};

const diagnoseValueOutOfRange = (
  diagnostics: BirdDiagnostic[],
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

  pushUnique(
    diagnostics,
    createRuleDiagnostic(
      "cfg/value-out-of-range",
      `Protocol '${declarationName}' has out-of-range value for '${fieldName}': ${value}`,
      range,
    ),
  );
};

const cfgNumericRules: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const declaration of protocolDeclarations(parsed)) {
    for (const statement of declaration.statements) {
      if (statement.kind === "local-as") {
        diagnoseNumberExpected(
          diagnostics,
          statement.asnRange,
          declaration.name,
          "local as",
          statement.asn,
        );
        diagnoseValueOutOfRange(
          diagnostics,
          statement.asnRange,
          declaration.name,
          "local as",
          numericValue(statement.asn),
          1,
          MAX_ASN,
        );
      }

      if (statement.kind === "neighbor") {
        if (statement.asnRange) {
          diagnoseNumberExpected(
            diagnostics,
            statement.asnRange,
            declaration.name,
            "neighbor as",
            statement.asn,
          );
          diagnoseValueOutOfRange(
            diagnostics,
            statement.asnRange,
            declaration.name,
            "neighbor as",
            numericValue(statement.asn),
            1,
            MAX_ASN,
          );
        }
      }

      if (statement.kind === "other") {
        const lowerText = statement.text.toLowerCase();

        const holdNumber = extractFirstNumberAfterKeyword(lowerText, "hold");
        if (holdNumber === null && /\bhold\b/.test(lowerText)) {
          diagnoseNumberExpected(diagnostics, statement, declaration.name, "hold", "");
        }
        diagnoseValueOutOfRange(
          diagnostics,
          statement,
          declaration.name,
          "hold",
          holdNumber,
          3,
          65_535,
        );

        const keepaliveNumber = extractFirstNumberAfterKeyword(lowerText, "keepalive");
        if (keepaliveNumber === null && /\bkeepalive\b/.test(lowerText)) {
          diagnoseNumberExpected(diagnostics, statement, declaration.name, "keepalive", "");
        }
        diagnoseValueOutOfRange(
          diagnostics,
          statement,
          declaration.name,
          "keepalive",
          keepaliveNumber,
          1,
          65_535,
        );

        const ttlNumber = extractFirstNumberAfterKeyword(lowerText, "ttl");
        if (ttlNumber === null && /\bttl\b/.test(lowerText)) {
          diagnoseNumberExpected(diagnostics, statement, declaration.name, "ttl", "");
        }
        diagnoseValueOutOfRange(diagnostics, statement, declaration.name, "ttl", ttlNumber, 1, 255);
      }

      if (statement.kind !== "channel") {
        continue;
      }

      for (const entry of statement.entries) {
        if (entry.kind === "limit") {
          diagnoseNumberExpected(
            diagnostics,
            entry.valueRange,
            declaration.name,
            "limit",
            entry.value,
          );
          diagnoseValueOutOfRange(
            diagnostics,
            entry.valueRange,
            declaration.name,
            "limit",
            numericValue(entry.value),
            0,
            MAX_ASN,
          );
        }

        if (entry.kind === "other") {
          const maxPrefixMatch = entry.text.match(/\bmax\s+prefix\s+([^;\s]+)/i);
          if (maxPrefixMatch) {
            const token = maxPrefixMatch[1] ?? "";
            diagnoseNumberExpected(diagnostics, entry, declaration.name, "max prefix", token);
            diagnoseValueOutOfRange(
              diagnostics,
              entry,
              declaration.name,
              "max prefix",
              numericValue(token),
              0,
              MAX_ASN,
            );
          }
        }
      }
    }
  }

  return diagnostics;
};

const cfgSwitchValueExpectedRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];
  const switchPattern =
    /\b(passive|stub|bfd|enabled|disabled|check\s+link|deterministic\s+med)\b\s+([^;\s]+)/i;

  for (const declaration of protocolDeclarations(parsed)) {
    for (const statement of declaration.statements) {
      if (statement.kind === "other") {
        const matched = statement.text.match(switchPattern);
        if (matched) {
          const token = matched[2] ?? "";
          if (!hasBooleanValue(token)) {
            pushUnique(
              diagnostics,
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

        pushUnique(
          diagnostics,
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

        pushUnique(
          diagnostics,
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

  for (const declaration of protocolDeclarations(parsed)) {
    for (const statement of declaration.statements) {
      if (statement.kind === "neighbor" && statement.addressKind !== "ip") {
        pushUnique(
          diagnostics,
          createRuleDiagnostic(
            "cfg/incompatible-type",
            `Protocol '${declaration.name}' neighbor address must be an IP literal`,
            statement.addressRange,
          ),
        );
      }

      if (statement.kind === "other" && /\brouter\s+id\s+\S+/i.test(statement.text)) {
        const matched = statement.text.match(/\brouter\s+id\s+([^;\s]+)/i);
        const value = matched?.[1] ?? "";
        if (value && isIP(value) !== 4) {
          pushUnique(
            diagnostics,
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

const visitTemplate = (
  name: string,
  graph: Map<string, string>,
  stack: Set<string>,
  visited: Set<string>,
): boolean => {
  if (stack.has(name)) {
    return true;
  }

  if (visited.has(name)) {
    return false;
  }

  visited.add(name);
  stack.add(name);

  const next = graph.get(name);
  if (next && visitTemplate(next, graph, stack, visited)) {
    return true;
  }

  stack.delete(name);
  return false;
};

const cfgCircularTemplateRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];
  const templates = templateDeclarations(parsed);
  if (templates.length === 0) {
    return diagnostics;
  }

  const graph = new Map<string, string>();
  const ranges = new Map<string, SourceRange>();

  for (const template of templates) {
    ranges.set(template.name.toLowerCase(), template.nameRange);
    if (template.fromTemplate) {
      graph.set(template.name.toLowerCase(), template.fromTemplate.toLowerCase());
    }
  }

  const visited = new Set<string>();

  for (const template of templates) {
    const stack = new Set<string>();
    if (!visitTemplate(template.name.toLowerCase(), graph, stack, visited)) {
      continue;
    }

    const range = ranges.get(template.name.toLowerCase()) ?? template.nameRange;
    pushUnique(
      diagnostics,
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

  for (const declaration of protocolDeclarations(parsed)) {
    if (!isProtocolType(declaration, "bgp")) {
      continue;
    }

    for (const statement of declaration.statements) {
      if (statement.kind !== "other") {
        continue;
      }

      if (/\bneighbor\s+\S+\s+as\s+[^0-9\s;]+/i.test(statement.text)) {
        pushUnique(
          diagnostics,
          createProtocolDiagnostic(
            "cfg/number-expected",
            `Protocol '${declaration.name}' expects numeric ASN in neighbor statement`,
            declaration,
            "error",
          ),
        );
      }
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

export const collectCfgRuleDiagnostics = (context: Parameters<BirdRule>[0]): BirdDiagnostic[] => {
  return cfgRules.flatMap((rule) => rule(context));
};
