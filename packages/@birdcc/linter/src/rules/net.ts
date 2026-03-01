import { isIP } from "node:net";
import type { BirdDiagnostic } from "@birdcc/core";
import type { FilterBodyStatement, SourceRange } from "@birdcc/parser";
import {
  createRuleDiagnostic,
  filterAndFunctionDeclarations,
  protocolDeclarations,
  pushUniqueDiagnostic,
  type BirdRule,
} from "./shared.js";

interface PrefixParts {
  address: string;
  length: number | null;
  raw: string;
}

const PREFIX_PATTERN_SOURCE = "([0-9A-Za-z:.]+\\/[^\\s,;{}[\\]]+)";

const extractPrefixes = (text: string): PrefixParts[] => {
  const prefixes: PrefixParts[] = [];
  const prefixPattern = new RegExp(PREFIX_PATTERN_SOURCE, "g");
  let matched = prefixPattern.exec(text);

  while (matched) {
    const raw = matched[1] ?? "";
    const [address, lengthText] = raw.split("/");
    if (!address || !lengthText) {
      matched = prefixPattern.exec(text);
      continue;
    }

    const normalizedLength = lengthText.trim();
    const length = /^\d+$/.test(normalizedLength) ? Number.parseInt(normalizedLength, 10) : null;
    prefixes.push({ address: address.trim(), length, raw });

    matched = prefixPattern.exec(text);
  }

  return prefixes;
};

const statementText = (statement: FilterBodyStatement): string => {
  if (statement.kind === "expression") {
    return statement.expressionText;
  }

  if (statement.kind === "other") {
    return statement.text;
  }

  if (statement.kind === "if") {
    return statement.conditionText ?? "";
  }

  if (statement.kind === "return") {
    return statement.valueText ?? "";
  }

  if (statement.kind === "case") {
    return statement.subjectText ?? "";
  }

  return "";
};

const analyzePrefix = (
  diagnostics: BirdDiagnostic[],
  seen: Set<string>,
  prefix: PrefixParts,
  range: SourceRange,
): void => {
  const family = isIP(prefix.address);

  if (prefix.length === null || prefix.length < 0 || prefix.length > 128) {
    pushUniqueDiagnostic(
      diagnostics,
      seen,
      createRuleDiagnostic(
        "net/invalid-prefix-length",
        `Invalid prefix length in '${prefix.raw}'`,
        range,
      ),
    );
    return;
  }

  if (prefix.address.includes(".")) {
    if (family !== 4) {
      pushUniqueDiagnostic(
        diagnostics,
        seen,
        createRuleDiagnostic(
          "net/invalid-ipv4-prefix",
          `Invalid IPv4 prefix '${prefix.raw}'`,
          range,
        ),
      );
      return;
    }

    if (prefix.length > 32) {
      pushUniqueDiagnostic(
        diagnostics,
        seen,
        createRuleDiagnostic(
          "net/max-prefix-length",
          `Invalid max prefix length ${prefix.length} for IPv4 prefix '${prefix.raw}'`,
          range,
        ),
      );
    }
    return;
  }

  if (prefix.address.includes(":")) {
    if (family !== 6) {
      pushUniqueDiagnostic(
        diagnostics,
        seen,
        createRuleDiagnostic(
          "net/invalid-ipv6-prefix",
          `Invalid IPv6 prefix '${prefix.raw}'`,
          range,
        ),
      );
      return;
    }

    if (prefix.length > 128) {
      pushUniqueDiagnostic(
        diagnostics,
        seen,
        createRuleDiagnostic(
          "net/max-prefix-length",
          `Invalid max prefix length ${prefix.length} for IPv6 prefix '${prefix.raw}'`,
          range,
        ),
      );
    }
    return;
  }

  pushUniqueDiagnostic(
    diagnostics,
    seen,
    createRuleDiagnostic("net/invalid-ipv4-prefix", `Invalid IP prefix '${prefix.raw}'`, range),
  );
};

const netPrefixRules: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];
  const seen = new Set<string>();

  for (const declaration of filterAndFunctionDeclarations(parsed)) {
    for (const statement of declaration.statements) {
      const text = statementText(statement);
      if (!text) {
        continue;
      }

      for (const prefix of extractPrefixes(text)) {
        analyzePrefix(diagnostics, seen, prefix, statement);
      }
    }

    for (const match of declaration.matches) {
      for (const prefix of extractPrefixes(match.right)) {
        analyzePrefix(diagnostics, seen, prefix, match);
      }
    }

    for (const literal of declaration.literals) {
      if (literal.kind !== "prefix") {
        continue;
      }

      for (const prefix of extractPrefixes(literal.value)) {
        analyzePrefix(diagnostics, seen, prefix, literal);
      }
    }
  }

  return diagnostics;
};

const netMaxPrefixRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];
  const seen = new Set<string>();

  for (const declaration of protocolDeclarations(parsed)) {
    for (const statement of declaration.statements) {
      if (statement.kind !== "channel") {
        continue;
      }

      if (statement.channelType !== "ipv4" && statement.channelType !== "ipv6") {
        continue;
      }

      const channelText = statement.entries
        .filter((entry) => entry.kind === "other")
        .map((entry) => entry.text)
        .join(" ");
      const matched = channelText.match(/\bmax\s+prefix\s+([^;\s]+)/i);
      if (!matched) {
        continue;
      }

      const token = (matched[1] ?? "").trim();
      if (!/^\d+$/.test(token)) {
        pushUniqueDiagnostic(
          diagnostics,
          seen,
          createRuleDiagnostic(
            "net/invalid-prefix-length",
            `Invalid prefix length in 'max prefix ${token}'`,
            statement,
          ),
        );
        continue;
      }

      const length = Number.parseInt(token, 10);
      if (Number.isNaN(length)) {
        continue;
      }

      const maxAllowed = statement.channelType === "ipv4" ? 32 : 128;
      if (length > maxAllowed) {
        pushUniqueDiagnostic(
          diagnostics,
          seen,
          createRuleDiagnostic(
            "net/max-prefix-length",
            `Invalid max prefix length ${length} for ${statement.channelType}`,
            statement,
          ),
        );
      }
    }
  }

  return diagnostics;
};

export const netRules: BirdRule[] = [netPrefixRules, netMaxPrefixRule];

export const collectNetRuleDiagnostics = (context: Parameters<BirdRule>[0]): BirdDiagnostic[] => {
  return netRules.flatMap((rule) => rule(context));
};
