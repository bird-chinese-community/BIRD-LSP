/**
 * ASN hover — shows rich ASN info when hovering over an integer in an ASN-relevant context.
 */

import { type Hover, type Position } from "vscode-languageserver/node.js";
import type { AsnIntel } from "@birdcc/intel";

/** Patterns to detect ASN integers on a line — must have at least one capture group for the digit span. */
const ASN_HOVER_PATTERNS = [
  /\blocal\s+as\s+(\d+)/gi,
  /\bas\s+(\d+)/gi,
  /\bremote\s+as\s+(\d+)/gi,
  /community\.add\(\(\s*(\d+)/gi,
  /large_community\.add\(\(\s*(\d+)/gi,
  /bgp_path\.prepend\(\s*(\d+)/gi,
  /\bdefine\s+\w+\s*=\s*(\d+)/gi,
];

/**
 * Try to produce an ASN hover for the given position.
 * Returns null if the cursor is not over an ASN integer.
 */
export const createAsnHover = (
  intel: AsnIntel,
  lineText: string,
  position: Position,
): Hover | null => {
  if (!intel.available) return null;

  const character = position.character;

  for (const pattern of ASN_HOVER_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(lineText)) !== null) {
      const digits = match[1];
      const digitStart = match.index + match[0].length - digits.length;
      const digitEnd = digitStart + digits.length;

      // Check if cursor is within the digit span
      if (character >= digitStart && character <= digitEnd) {
        const asn = parseInt(digits, 10);
        if (Number.isNaN(asn) || asn <= 0) continue;

        const display = intel.lookupDisplay(asn);
        if (!display) return null;

        return {
          contents: {
            kind: "markdown",
            value: display.hoverMarkdown,
          },
          range: {
            start: { line: position.line, character: digitStart },
            end: { line: position.line, character: digitEnd },
          },
        };
      }
    }
  }

  return null;
};
