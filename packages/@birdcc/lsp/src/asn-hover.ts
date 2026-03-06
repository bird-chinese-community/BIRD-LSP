/**
 * ASN hover — shows rich ASN info when hovering over an integer in an ASN-relevant context.
 */

import { type Hover, type Position } from "vscode-languageserver/node.js";
import type { AsnIntel } from "@birdcc/intel";
import { findAsnMatchesInLine } from "./asn-context.js";

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

  for (const match of findAsnMatchesInLine(lineText)) {
    if (character < match.start || character > match.end) {
      continue;
    }

    const display = intel.lookupDisplay(match.asn);
    if (!display) return null;

    return {
      contents: {
        kind: "markdown",
        value: display.hoverMarkdown,
      },
      range: {
        start: { line: position.line, character: match.start },
        end: { line: position.line, character: match.end },
      },
    };
  }

  return null;
};
