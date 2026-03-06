/**
 * ASN-aware completion provider for BIRD2 configuration files.
 *
 * Triggers on numeric input in ASN-relevant contexts:
 * - `# AS<digits>` (comment annotations)
 * - `neighbor ... as <digits>`
 * - `local as <digits>`
 * - `bgp_community.add((<digits>, ...))`
 * - `bgp_path.prepend(<digits>)` / `bgp_path.delete(<digits>)`
 * - `bgp_path ~ [<digits>, ...]`
 * - `define MY_ASN = <digits>`
 */

import {
  CompletionItemKind,
  type CompletionItem,
} from "vscode-languageserver/node.js";
import type { AsnIntel } from "@birdcc/intel";
import { extractAsnPrefix } from "./asn-context.js";

export { extractAsnPrefix } from "./asn-context.js";

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
