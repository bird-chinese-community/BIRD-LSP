import type { BirdDiagnostic } from "@birdcc/core";
import {
  createProtocolDiagnostic,
  createRuleDiagnostic,
  isProtocolType,
  protocolDeclarations,
  protocolOtherTextEntries,
  type BirdRule,
} from "./shared.js";

const isAreaClause = (text: string): boolean => /^area\b/i.test(text.trim());

const ospfMissingAreaRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const declaration of protocolDeclarations(parsed)) {
    if (!isProtocolType(declaration, "ospf")) {
      continue;
    }

    const hasArea = protocolOtherTextEntries(declaration).some((entry) => isAreaClause(entry.text));
    if (hasArea) {
      continue;
    }

    diagnostics.push(
      createProtocolDiagnostic(
        "ospf/missing-area",
        `OSPF protocol '${declaration.name}' has no configured areas`,
        declaration,
      ),
    );
  }

  return diagnostics;
};

const ospfBackboneStubRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const declaration of protocolDeclarations(parsed)) {
    if (!isProtocolType(declaration, "ospf")) {
      continue;
    }

    for (const entry of protocolOtherTextEntries(declaration)) {
      const clause = entry.text.replace(/\s+/g, " ").toLowerCase();
      if (!/^area\s+0\b/.test(clause) || !/\bstub\b/.test(clause)) {
        continue;
      }

      diagnostics.push(
        createRuleDiagnostic(
          "ospf/backbone-stub",
          `OSPF protocol '${declaration.name}' configures backbone area as stub`,
          entry.range,
        ),
      );
    }
  }

  return diagnostics;
};

const ospfVlinkInBackboneRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const declaration of protocolDeclarations(parsed)) {
    if (!isProtocolType(declaration, "ospf")) {
      continue;
    }

    for (const entry of protocolOtherTextEntries(declaration)) {
      const clause = entry.text.replace(/\s+/g, " ").toLowerCase();
      if (!/^area\s+0\b/.test(clause) || !/\bvlink\b/.test(clause)) {
        continue;
      }

      diagnostics.push(
        createRuleDiagnostic(
          "ospf/vlink-in-backbone",
          `OSPF protocol '${declaration.name}' cannot configure vlink in backbone area`,
          entry.range,
        ),
      );
    }
  }

  return diagnostics;
};

const ospfAsbrStubAreaRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const declaration of protocolDeclarations(parsed)) {
    if (!isProtocolType(declaration, "ospf")) {
      continue;
    }

    const entries = protocolOtherTextEntries(declaration);
    const hasStubArea = entries.some(
      (entry) => /^area\b/i.test(entry.text) && /\bstub\b/i.test(entry.text),
    );
    const hasAsbr = entries.some((entry) => /\basbr\b/i.test(entry.text));

    if (!hasStubArea || !hasAsbr) {
      continue;
    }

    diagnostics.push(
      createProtocolDiagnostic(
        "ospf/asbr-stub-area",
        `OSPF protocol '${declaration.name}' declares ASBR inside stub area`,
        declaration,
      ),
    );
  }

  return diagnostics;
};

export const ospfRules: BirdRule[] = [
  ospfMissingAreaRule,
  ospfBackboneStubRule,
  ospfVlinkInBackboneRule,
  ospfAsbrStubAreaRule,
];

export const collectOspfRuleDiagnostics = (context: Parameters<BirdRule>[0]): BirdDiagnostic[] => {
  return ospfRules.flatMap((rule) => rule(context));
};
