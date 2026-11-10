import { isIP } from "node:net";
import { findNetworkLiteralAt, type SourceRange } from "@birdcc/parser";
import { findAsnMatchesInLine } from "./asn-context.js";

export type Dn42HoverCandidate =
  | { kind: "ip"; ip: string; start: number; end: number }
  | { kind: "asn"; asn: number; start: number; end: number };

const NETWORK_CHARACTER = /[0-9A-Fa-f:.]/;

const candidateAt = (
  line: string,
  character: number,
): Dn42HoverCandidate | undefined => {
  if (NETWORK_CHARACTER.test(line[character] ?? "")) {
    let start = character;
    let end = character + 1;
    while (start > 0 && NETWORK_CHARACTER.test(line[start - 1] ?? "")) start--;
    while (end < line.length && NETWORK_CHARACTER.test(line[end] ?? "")) end++;
    const ip = line.slice(start, end);
    if (isIP(ip)) return { kind: "ip", ip, start, end };
  }
  const match = findAsnMatchesInLine(line).find(
    (item) => item.start <= character && character < item.end,
  );
  return match && { kind: "asn", ...match };
};

/**
 * Resolves the IP literal or ASN integer under an LSP position. The line text
 * yields a candidate and `resolve` looks it up; the document is parsed only
 * for a resolved candidate, to exclude comments, strings and prefixes.
 */
export const findDn42Hover = async <T>(
  text: string,
  lineText: string,
  position: { line: number; character: number },
  resolve: (candidate: Dn42HoverCandidate) => T | undefined,
): Promise<{ value: T; range: SourceRange } | null> => {
  const candidate = candidateAt(lineText, position.character);
  const value = candidate && resolve(candidate);
  if (!candidate || value === undefined) return null;
  const literal = await findNetworkLiteralAt(text, position);
  return literal?.kind === (candidate.kind === "ip" ? "ip" : "number") &&
    literal.range.line === position.line + 1 &&
    literal.range.column - 1 === candidate.start &&
    literal.range.endColumn - 1 === candidate.end
    ? { value, range: literal.range }
    : null;
};
