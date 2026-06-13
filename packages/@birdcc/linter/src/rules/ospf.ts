import type { BirdDiagnostic } from "@birdcc/core";
import type {
  ParsedBirdDocument,
  ProtocolDeclaration,
  ProtocolStatement,
  SourceRange,
  TemplateDeclaration,
} from "@birdcc/parser";
import {
  createProtocolDiagnostic,
  createRuleDiagnostic,
  isProtocolTypeFamily,
  protocolDeclarations,
  protocolOtherTextEntries,
  type BirdRule,
} from "./shared.js";

interface OspfAreaSegment {
  areaId: string;
  text: string;
  range: SourceRange;
  hasStub?: boolean;
  hasVlink?: boolean;
}

const BACKBONE_AREA_IDS = new Set(["0", "0.0.0.0"]);

const normalizeAreaId = (value: string): string => value.trim().toLowerCase();

const isBackboneArea = (value: string): boolean =>
  BACKBONE_AREA_IDS.has(normalizeAreaId(value));

const isAsbrEnabled = (text: string): boolean => {
  const normalized = text.trim().toLowerCase();
  if (!/\basbr\b/i.test(normalized)) {
    return false;
  }

  // Disabled forms: "no asbr", "asbr no", "asbr off", "asbr false".
  return (
    !/\bno\s+asbr\b/i.test(normalized) &&
    !/\basbr\s+(?:no|off|false)\b/i.test(normalized)
  );
};

const hasProtocolAsbr = (
  declaration: ProtocolDeclaration,
  parsed: ParsedBirdDocument,
): boolean => {
  const declarations = parsed.program.declarations;
  const visited = new Set<string>();
  let current: ProtocolDeclaration | TemplateDeclaration | undefined =
    declaration;
  let depth = 0;
  const maxDepth = 10;

  while (current && depth < maxDepth) {
    if (current.kind === "protocol") {
      const asbrStatements = current.statements.filter(
        (
          statement,
        ): statement is Extract<ProtocolStatement, { kind: "other" }> =>
          statement.kind === "other" && /\basbr\b/i.test(statement.text),
      );
      if (asbrStatements.length > 0) {
        const lastStatement = asbrStatements[asbrStatements.length - 1];
        return isAsbrEnabled(lastStatement.text);
      }
    } else if (current.kind === "template") {
      const bodyText = current.bodyText ?? "";
      if (/\basbr\b/i.test(bodyText)) {
        return isAsbrEnabled(bodyText);
      }
    }

    const templateName = current.fromTemplate;
    if (!templateName) {
      break;
    }

    const key = templateName.toLowerCase();
    if (visited.has(key)) {
      break;
    }
    visited.add(key);

    current = declarations.find(
      (decl): decl is TemplateDeclaration =>
        decl.kind === "template" && decl.name.toLowerCase() === key,
    );
    depth += 1;
  }

  return false;
};

const parseAreaSegments = (
  text: string,
  range: SourceRange,
): OspfAreaSegment[] => {
  const segments: OspfAreaSegment[] = [];
  const consumedRanges: Array<{ start: number; end: number }> = [];
  const blockPattern = /\barea\s+([^\s{;]+)([^{};]*)\{/gi;
  let matched = blockPattern.exec(text);

  while (matched) {
    const matchedText = matched[0] ?? "";
    const areaId = normalizeAreaId(matched[1] ?? "");
    const header = (matched[2] ?? "").trim();
    const openBraceIndex = (matched.index ?? 0) + matchedText.length - 1;

    let cursor = openBraceIndex + 1;
    let depth = 1;
    while (cursor < text.length && depth > 0) {
      if (text[cursor] === "{") {
        depth += 1;
      } else if (text[cursor] === "}") {
        depth -= 1;
      }
      cursor += 1;
    }

    const closeBraceIndex = depth === 0 ? cursor - 1 : text.length - 1;
    const body = text.slice(openBraceIndex + 1, closeBraceIndex);
    const scopeText = `${header} ${body}`.trim();
    if (areaId.length > 0) {
      segments.push({ areaId, text: scopeText, range });
      consumedRanges.push({
        start: matched.index ?? 0,
        end: closeBraceIndex + 1,
      });
    }

    blockPattern.lastIndex = Math.max(
      closeBraceIndex + 1,
      blockPattern.lastIndex,
    );
    matched = blockPattern.exec(text);
  }

  const inlinePattern = /\barea\s+([^\s{;]+)\s+([^{};\n]+)\s*;?/gi;
  let inline = inlinePattern.exec(text);
  while (inline) {
    const start = inline.index ?? 0;
    const insideBlock = consumedRanges.some(
      (item) => start >= item.start && start < item.end,
    );
    if (!insideBlock) {
      const areaId = normalizeAreaId(inline[1] ?? "");
      const inlineText = (inline[2] ?? "").trim();
      if (areaId.length > 0) {
        segments.push({ areaId, text: inlineText, range });
      }
    }

    inline = inlinePattern.exec(text);
  }

  return segments;
};

const collectAreas = (
  declaration: Parameters<typeof protocolOtherTextEntries>[0],
): OspfAreaSegment[] => {
  const areas: OspfAreaSegment[] = declaration.statements.flatMap(
    (statement) => {
      if (statement.kind !== "ospf-area") {
        return [];
      }

      const text = statement.entries
        .map((entry) => (entry.kind === "other" ? entry.text : entry.kind))
        .join(" ");

      let hasStub: boolean | undefined;
      let hasVlink: boolean | undefined;
      for (const entry of statement.entries) {
        if (entry.kind === "stub") {
          hasStub = entry.value === undefined || entry.value;
          continue;
        }

        if (entry.kind === "virtual-link") {
          hasVlink = true;
          continue;
        }
      }

      return [
        {
          areaId: normalizeAreaId(statement.areaId),
          text,
          range: statement,
          hasStub,
          hasVlink,
        },
      ];
    },
  );

  for (const entry of protocolOtherTextEntries(declaration)) {
    areas.push(...parseAreaSegments(entry.text, entry.range));
  }
  return areas;
};

const ospfMissingAreaRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const declaration of protocolDeclarations(parsed)) {
    if (!isProtocolTypeFamily(declaration, "ospf")) {
      continue;
    }

    const areas = collectAreas(declaration);
    if (areas.length > 0) {
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
    if (!isProtocolTypeFamily(declaration, "ospf")) {
      continue;
    }

    const areas = collectAreas(declaration);
    for (const area of areas) {
      if (
        !isBackboneArea(area.areaId) ||
        !(area.hasStub ?? /\bstub\b/i.test(area.text))
      ) {
        continue;
      }

      diagnostics.push(
        createRuleDiagnostic(
          "ospf/backbone-stub",
          `OSPF protocol '${declaration.name}' configures backbone area as stub`,
          area.range,
        ),
      );
    }
  }

  return diagnostics;
};

const ospfVlinkInBackboneRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const declaration of protocolDeclarations(parsed)) {
    if (!isProtocolTypeFamily(declaration, "ospf")) {
      continue;
    }

    const areas = collectAreas(declaration);
    for (const area of areas) {
      if (
        !isBackboneArea(area.areaId) ||
        !(
          area.hasVlink ??
          /\b(?:vlink|virtual-link|virtual\s+link)\b/i.test(area.text)
        )
      ) {
        continue;
      }

      diagnostics.push(
        createRuleDiagnostic(
          "ospf/vlink-in-backbone",
          `OSPF protocol '${declaration.name}' cannot configure vlink in backbone area`,
          area.range,
        ),
      );
    }
  }

  return diagnostics;
};

const ospfAsbrStubAreaRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const declaration of protocolDeclarations(parsed)) {
    if (!isProtocolTypeFamily(declaration, "ospf")) {
      continue;
    }

    const protocolAsbr = hasProtocolAsbr(declaration, parsed);
    const areas = collectAreas(declaration);
    for (const area of areas) {
      if (isBackboneArea(area.areaId)) {
        continue;
      }

      const hasStub = area.hasStub ?? /\bstub\b/i.test(area.text);
      const hasAsbr = protocolAsbr || isAsbrEnabled(area.text);
      if (!hasStub || !hasAsbr) {
        continue;
      }

      diagnostics.push(
        createRuleDiagnostic(
          "ospf/asbr-stub-area",
          `OSPF protocol '${declaration.name}' declares ASBR inside stub area ${area.areaId}`,
          area.range,
        ),
      );
    }
  }

  return diagnostics;
};

export const ospfRules: BirdRule[] = [
  ospfMissingAreaRule,
  ospfBackboneStubRule,
  ospfVlinkInBackboneRule,
  ospfAsbrStubAreaRule,
];

export const collectOspfRuleDiagnostics = (
  context: Parameters<BirdRule>[0],
): BirdDiagnostic[] => {
  return ospfRules.flatMap((rule) => rule(context));
};
