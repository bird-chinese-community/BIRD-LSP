import { isIP } from "node:net";
import type { BirdDiagnostic } from "@birdcc/core";
import {
  filterAndFunctionDeclarations,
  protocolDeclarations,
  createRuleDiagnostic,
  type BirdRule,
} from "./shared.js";

interface PrefixParts {
  address: string;
  length: number | null;
  raw: string;
}

const pushUnique = (diagnostics: BirdDiagnostic[], diagnostic: BirdDiagnostic): void => {
  if (
    diagnostics.some(
      (item) =>
        item.code === diagnostic.code &&
        item.range.line === diagnostic.range.line &&
        item.range.column === diagnostic.range.column,
    )
  ) {
    return;
  }

  diagnostics.push(diagnostic);
};

const collectFilterTexts = (sourceText: string): string[] => {
  const text = sourceText.trim();
  if (!text) {
    return [];
  }

  return text
    .split(/[;\n]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
};

const prefixPattern = /([0-9A-Za-z:.]+\/-?\d+)/g;

const extractPrefixes = (text: string): PrefixParts[] => {
  const prefixes: PrefixParts[] = [];
  let matched = prefixPattern.exec(text);

  while (matched) {
    const raw = matched[1] ?? "";
    const [address, lengthText] = raw.split("/");
    if (!address || !lengthText) {
      matched = prefixPattern.exec(text);
      continue;
    }

    const normalizedLength = lengthText.trim();
    const length = /^-?\d+$/.test(normalizedLength) ? Number.parseInt(normalizedLength, 10) : null;
    prefixes.push({
      address: address.trim(),
      length,
      raw,
    });

    matched = prefixPattern.exec(text);
  }

  return prefixes;
};

const netPrefixRules: BirdRule = ({ parsed, text }) => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const snippet of collectFilterTexts(text)) {
    for (const prefix of extractPrefixes(snippet)) {
      const family = isIP(prefix.address);

      if (prefix.length === null || prefix.length < 0 || prefix.length > 128) {
        pushUnique(
          diagnostics,
          createRuleDiagnostic(
            "net/invalid-prefix-length",
            `Invalid prefix length in '${prefix.raw}'`,
            { line: 1, column: 1, endLine: 1, endColumn: 1 },
          ),
        );
        continue;
      }

      if (prefix.address.includes(".")) {
        if (family !== 4) {
          pushUnique(
            diagnostics,
            createRuleDiagnostic("net/invalid-ipv4-prefix", `Invalid IPv4 prefix '${prefix.raw}'`, {
              line: 1,
              column: 1,
              endLine: 1,
              endColumn: 1,
            }),
          );
          continue;
        }

        if (prefix.length > 32) {
          pushUnique(
            diagnostics,
            createRuleDiagnostic(
              "net/max-prefix-length",
              `Invalid max prefix length ${prefix.length} for IPv4 prefix '${prefix.raw}'`,
              { line: 1, column: 1, endLine: 1, endColumn: 1 },
            ),
          );
        }
        continue;
      }

      if (prefix.address.includes(":")) {
        if (family !== 6) {
          pushUnique(
            diagnostics,
            createRuleDiagnostic("net/invalid-ipv6-prefix", `Invalid IPv6 prefix '${prefix.raw}'`, {
              line: 1,
              column: 1,
              endLine: 1,
              endColumn: 1,
            }),
          );
          continue;
        }

        if (prefix.length > 128) {
          pushUnique(
            diagnostics,
            createRuleDiagnostic(
              "net/max-prefix-length",
              `Invalid max prefix length ${prefix.length} for IPv6 prefix '${prefix.raw}'`,
              { line: 1, column: 1, endLine: 1, endColumn: 1 },
            ),
          );
        }
      }
    }
  }

  for (const declaration of filterAndFunctionDeclarations(parsed)) {
    for (const literal of declaration.literals) {
      if (literal.kind !== "prefix") {
        continue;
      }

      for (const prefix of extractPrefixes(literal.value)) {
        if (prefix.length !== null && prefix.length >= 0 && prefix.length <= 128) {
          continue;
        }

        pushUnique(
          diagnostics,
          createRuleDiagnostic(
            "net/invalid-prefix-length",
            `Invalid prefix length in '${prefix.raw}'`,
            literal,
          ),
        );
      }
    }
  }

  return diagnostics;
};

const netMaxPrefixRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const declaration of protocolDeclarations(parsed)) {
    for (const statement of declaration.statements) {
      if (statement.kind !== "channel") {
        continue;
      }

      if (statement.channelType !== "ipv4" && statement.channelType !== "ipv6") {
        continue;
      }

      for (const entry of statement.entries) {
        if (entry.kind !== "other") {
          continue;
        }

        const matched = entry.text.match(/\bmax\s+prefix\s+(-?\d+)/i);
        if (!matched) {
          continue;
        }

        const length = Number.parseInt(matched[1] ?? "", 10);
        if (Number.isNaN(length)) {
          continue;
        }

        const maxAllowed = statement.channelType === "ipv4" ? 32 : 128;
        if (length > maxAllowed) {
          pushUnique(
            diagnostics,
            createRuleDiagnostic(
              "net/max-prefix-length",
              `Invalid max prefix length ${length} for ${statement.channelType}`,
              entry,
            ),
          );
        }
      }
    }
  }

  return diagnostics;
};

export const netRules: BirdRule[] = [netPrefixRules, netMaxPrefixRule];

export const collectNetRuleDiagnostics = (context: Parameters<BirdRule>[0]): BirdDiagnostic[] => {
  return netRules.flatMap((rule) => rule(context));
};
