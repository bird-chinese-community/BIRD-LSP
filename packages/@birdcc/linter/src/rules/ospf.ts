import type { BirdDiagnostic } from "@birdcc/core";
import type { SourceRange } from "@birdcc/parser";
import {
  createProtocolDiagnostic,
  createRuleDiagnostic,
  isProtocolType,
  protocolDeclarations,
  protocolOtherTextEntries,
  type BirdRule,
} from "./shared.js";

interface OspfAreaSegment {
  areaId: string;
  text: string;
  range: SourceRange;
}

const BACKBONE_AREA_IDS = new Set(["0", "0.0.0.0"]);

const normalizeAreaId = (value: string): string => value.trim().toLowerCase();

const isBackboneArea = (value: string): boolean => BACKBONE_AREA_IDS.has(normalizeAreaId(value));

const parseAreaSegments = (text: string, range: SourceRange): OspfAreaSegment[] => {
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
      consumedRanges.push({ start: matched.index ?? 0, end: closeBraceIndex + 1 });
    }

    blockPattern.lastIndex = Math.max(closeBraceIndex + 1, blockPattern.lastIndex);
    matched = blockPattern.exec(text);
  }

  const inlinePattern = /\barea\s+([^\s{;]+)\s+([^{};\n]+)\s*;?/gi;
  let inline = inlinePattern.exec(text);
  while (inline) {
    const start = inline.index ?? 0;
    const insideBlock = consumedRanges.some((item) => start >= item.start && start < item.end);
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

const collectAreas = (entries: Array<{ text: string; range: SourceRange }>): OspfAreaSegment[] => {
  const areas: OspfAreaSegment[] = [];
  for (const entry of entries) {
    areas.push(...parseAreaSegments(entry.text, entry.range));
  }
  return areas;
};

const ospfMissingAreaRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const declaration of protocolDeclarations(parsed)) {
    if (!isProtocolType(declaration, "ospf")) {
      continue;
    }

    const areas = collectAreas(protocolOtherTextEntries(declaration));
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
    if (!isProtocolType(declaration, "ospf")) {
      continue;
    }

    const areas = collectAreas(protocolOtherTextEntries(declaration));
    for (const area of areas) {
      if (!isBackboneArea(area.areaId) || !/\bstub\b/i.test(area.text)) {
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
    if (!isProtocolType(declaration, "ospf")) {
      continue;
    }

    const areas = collectAreas(protocolOtherTextEntries(declaration));
    for (const area of areas) {
      if (!isBackboneArea(area.areaId) || !/\bvlink\b/i.test(area.text)) {
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
    if (!isProtocolType(declaration, "ospf")) {
      continue;
    }

    const areas = collectAreas(protocolOtherTextEntries(declaration));
    for (const area of areas) {
      if (isBackboneArea(area.areaId)) {
        continue;
      }

      if (!/\bstub\b/i.test(area.text) || !/\basbr\b/i.test(area.text)) {
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

export const collectOspfRuleDiagnostics = (context: Parameters<BirdRule>[0]): BirdDiagnostic[] => {
  return ospfRules.flatMap((rule) => rule(context));
};
