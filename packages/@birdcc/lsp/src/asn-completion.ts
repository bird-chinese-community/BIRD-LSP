/**
 * ASN-aware completion provider for BIRD2 configuration files.
 *
 * Triggers on numeric input in ASN-relevant contexts:
 * - `# AS<digits>` (comment annotations)
 * - `neighbor ... as <digits>`
 * - `local as <digits>`
 * - `bgp_community.add((<digits>, ...))`
 * - `bgp_path.prepend(<digits>)`
 * - `remote as <digits>`
 * - `define ... = <digits>`
 */

import {
  CompletionItemKind,
  type CompletionItem,
} from "vscode-languageserver/node.js";
import type { AsnIntel } from "@birdcc/intel";

/** Context patterns where an integer is likely an ASN. */
const ASN_CONTEXT_PATTERNS = [
  // "# AS12345" — comment annotation
  /(?:^|\s)#\s*AS(\d+)$/i,
  // "local as 12345"
  /\blocal\s+as\s+(\d+)$/i,
  // "neighbor ... as 12345"
  /\bas\s+(\d+)$/i,
  // "remote as 12345"
  /\bremote\s+as\s+(\d+)$/i,
  // "bgp_community.add((12345" or "bgp_large_community.add((12345"
  /community\.add\(\(\s*(\d+)$/i,
  // "bgp_path.prepend(12345"
  /bgp_path\.prepend\(\s*(\d+)$/i,
  // "define ASN = 12345" or "define MY_ASN = 12345"
  /\bdefine\s+\w+\s*=\s*(\d+)$/i,
];

/**
 * Extract the ASN digit prefix from the current line prefix, if in an ASN-relevant context.
 * Returns the digit string or undefined.
 */
export const extractAsnPrefix = (linePrefix: string): string | undefined => {
  for (const pattern of ASN_CONTEXT_PATTERNS) {
    const match = pattern.exec(linePrefix);
    if (match) {
      return match[1];
    }
  }

  return undefined;
};

/**
 * Generate ASN completion items with progressive matching.
 * As the user types digits (e.g., "1" → "12" → "123"), results narrow down.
 */
export const createAsnCompletionItems = (
  intel: AsnIntel,
  linePrefix: string,
  limit = 10,
): CompletionItem[] => {
  if (!intel.available) return [];

  const prefix = extractAsnPrefix(linePrefix);
  if (!prefix) return [];

  const entries = intel.prefixSearch(prefix, limit);

  return entries.map((entry, index) => {
    const display = intel.formatDisplay(entry);
    return {
      label: String(entry.asn),
      kind: CompletionItemKind.Value,
      detail: display.completionDetail,
      documentation: {
        kind: "markdown" as const,
        value: display.hoverMarkdown,
      },
      sortText: String(index).padStart(4, "0"),
      filterText: String(entry.asn),
    };
  });
};
