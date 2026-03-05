/**
 * Lightweight brace-depth scanner for BIRD config content.
 *
 * Used to distinguish global-scope `router id` (braceDepth == 0) from
 * protocol-level overrides (braceDepth > 0), without requiring a full parse.
 */

export interface BraceScanResult {
  /** Line numbers (1-based) where global `router id` is found (braceDepth == 0) */
  globalRouterIdLines: number[];
  /** Line numbers where protocol-level `router id` is found (braceDepth > 0) */
  protocolRouterIdLines: number[];
}

const ROUTER_ID_PATTERN = /\brouter\s+id\b/i;

/**
 * Scans content for `router id` directives, classifying them by brace depth.
 *
 * Handles:
 * - `#` line comments
 * - C-style block comments
 * - Brace counting (ignoring braces inside comments/strings)
 */
export const scanBraceDepth = (content: string): BraceScanResult => {
  const lines = content.split("\n");
  const result: BraceScanResult = {
    globalRouterIdLines: [],
    protocolRouterIdLines: [],
  };

  let depth = 0;
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let j = 0;
    // Track effective content for this line (excluding comments)
    let effectiveContent = "";

    while (j < line.length) {
      if (inBlockComment) {
        const endComment = line.indexOf("*/", j);
        if (endComment === -1) {
          // Entire rest of line is in block comment
          j = line.length;
        } else {
          inBlockComment = false;
          j = endComment + 2;
        }
        continue;
      }

      const ch = line[j];

      // Line comment — skip rest of line
      if (ch === "#") {
        break;
      }

      // Block comment start
      if (ch === "/" && j + 1 < line.length && line[j + 1] === "*") {
        inBlockComment = true;
        j += 2;
        continue;
      }

      // String literal — skip contents (BIRD uses double quotes)
      if (ch === '"') {
        j++;
        while (j < line.length && line[j] !== '"') {
          if (line[j] === "\\") j++; // skip escaped char
          j++;
        }
        j++; // skip closing quote
        continue;
      }

      // Brace tracking
      if (ch === "{") {
        effectiveContent += ch;
        depth++;
        j++;
        continue;
      }
      if (ch === "}") {
        effectiveContent += ch;
        depth = Math.max(0, depth - 1);
        j++;
        continue;
      }

      effectiveContent += ch;
      j++;
    }

    // Check for router id in effective content (outside comments/strings)
    if (ROUTER_ID_PATTERN.test(effectiveContent)) {
      // Determine what depth was at the start of this line's content
      // We need to check depth *before* any brace changes on this line
      // Actually we check current depth state, which accounts for braces
      // opened on this line. For `router id` the key question is:
      // is this line inside a block?
      //
      // Simpler approach: re-scan the line to find where `router id` sits
      const routerIdDepth = getRouterIdDepth(line, depth, effectiveContent);
      if (routerIdDepth === 0) {
        result.globalRouterIdLines.push(i + 1);
      } else {
        result.protocolRouterIdLines.push(i + 1);
      }
    }
  }

  return result;
};

/**
 * Determines the brace depth at which `router id` appears on a given line.
 * Uses the depth state *at the start of the line* (before processing the line's braces).
 */
const getRouterIdDepth = (
  line: string,
  depthAfterLine: number,
  _effectiveContent: string,
): number => {
  // Count braces in the line to figure out the starting depth
  let openBraces = 0;
  let closeBraces = 0;
  let inBlock = false;
  let inStr = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inBlock) {
      if (ch === "*" && i + 1 < line.length && line[i + 1] === "/") {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === "#") break;
    if (ch === "/" && i + 1 < line.length && line[i + 1] === "*") {
      inBlock = true;
      i++;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{") openBraces++;
    if (ch === "}") closeBraces++;
  }

  // Depth at start of line = depthAfterLine - openBraces + closeBraces
  const depthAtStart = depthAfterLine - openBraces + closeBraces;
  return Math.max(0, depthAtStart);
};
