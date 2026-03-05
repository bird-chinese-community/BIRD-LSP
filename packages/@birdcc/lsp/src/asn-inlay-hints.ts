/**
 * ASN inlay hints — shows flag + AS number next to integer literals in ASN-relevant positions.
 *
 * Scans lines for patterns like `local as 65001`, `neighbor ... as 4134`,
 * `define ASN = 13335`, etc. and produces InlayHint items.
 */

import {
  InlayHint,
  InlayHintKind,
  type Range,
} from "vscode-languageserver/node.js";
import type { AsnIntel } from "@birdcc/intel";

/** Patterns that capture an ASN integer and its position within the line. */
const ASN_INLINE_PATTERNS = [
  // "local as <digits>" — captures the digit span
  /\blocal\s+as\s+(\d+)/gi,
  // "neighbor ... as <digits>"
  /\bas\s+(\d+)/gi,
  // "remote as <digits>"
  /\bremote\s+as\s+(\d+)/gi,
  // "bgp_community.add((<digits>"
  /community\.add\(\(\s*(\d+)/gi,
  // "bgp_large_community.add((<digits>"
  /large_community\.add\(\(\s*(\d+)/gi,
  // "bgp_path.prepend(<digits>)"
  /bgp_path\.prepend\(\s*(\d+)/gi,
  // "define <NAME> = <digits>"
  /\bdefine\s+\w+\s*=\s*(\d+)/gi,
];

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

    for (const pattern of ASN_INLINE_PATTERNS) {
      // Reset regex state
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(lineText)) !== null) {
        const digits = match[1];
        const asn = parseInt(digits, 10);
        if (Number.isNaN(asn) || asn <= 0) continue;

        // Position after the digit span
        const digitStart = match.index + match[0].length - digits.length;
        const digitEnd = digitStart + digits.length;

        const key = `${lineIdx}:${digitEnd}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const display = intel.lookupDisplay(asn);
        if (!display) continue;

        hints.push({
          position: { line: lineIdx, character: digitEnd },
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
  }

  return hints;
};
