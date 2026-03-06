/**
 * ASN inlay hints — shows flag + AS number next to integer literals in ASN-relevant positions.
 *
 * Scans lines for patterns like `local as 65001`, `neighbor ... as 4134`,
 * `define MY_ASN = 13335`, `bgp_path ~ [174, 701]`, etc. and produces InlayHint items.
 */

import {
  InlayHint,
  InlayHintKind,
  type Range,
} from "vscode-languageserver/node.js";
import type { AsnIntel } from "@birdcc/intel";
import { findAsnMatchesInLine } from "./asn-context.js";

/**
 * Generate inlay hints for ASN integers within the given text range.
 */
export const createAsnInlayHints = (
  intel: AsnIntel,
  text: string,
  range: Range,
): InlayHint[] => {
  if (!intel.available) return [];

  const hints: InlayHint[] = [];
  const lines = text.split("\n");
  const startLine = range.start.line;
  const endLine = Math.min(range.end.line, lines.length - 1);

  // Track which (line, column) positions we've already hinted to avoid duplicates
  const seen = new Set<string>();

  for (let lineIdx = startLine; lineIdx <= endLine; lineIdx++) {
    const lineText = lines[lineIdx];
    if (!lineText) continue;

    for (const match of findAsnMatchesInLine(lineText)) {
      const key = `${lineIdx}:${match.end}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const display = intel.lookupDisplay(match.asn);
      if (!display) continue;

      hints.push({
        position: { line: lineIdx, character: match.end },
        label: ` ${display.inlayLabel}`,
        kind: InlayHintKind.Parameter,
        paddingLeft: true,
        tooltip: {
          kind: "markdown",
          value: display.hoverMarkdown,
        },
      });
    }
  }

  return hints;
};
