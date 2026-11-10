import { isIP } from "node:net";
import { findNetworkLiteralAt, type SourceRange } from "@birdcc/parser";
import { findAsnMatchesInLine } from "./asn-context.js";

export type Dn42HoverTarget =
  | { kind: "ip"; ip: string; range: SourceRange }
  | { kind: "asn"; asn: number; range: SourceRange };

const NETWORK_CHARACTER = /[0-9A-Fa-f:.]/;

const networkTokenAt = (line: string, character: number): string => {
  if (!NETWORK_CHARACTER.test(line[character] ?? "")) return "";
  let start = character;
  let end = character + 1;
  while (start > 0 && NETWORK_CHARACTER.test(line[start - 1] ?? "")) start--;
  while (end < line.length && NETWORK_CHARACTER.test(line[end] ?? "")) end++;
  return line.slice(start, end);
};

/**
 * Resolves the IP literal or ASN integer under an LSP position. The line text
 * screens out other tokens so that only plausible targets are parsed.
 */
export const findDn42HoverTarget = async (
  text: string,
  lineText: string,
  position: { line: number; character: number },
): Promise<Dn42HoverTarget | null> => {
  const address = isIP(networkTokenAt(lineText, position.character)) !== 0;
  const asn = address
    ? undefined
    : findAsnMatchesInLine(lineText).find(
        (match) =>
          match.start <= position.character && position.character < match.end,
      );
  if (!address && !asn) return null;
  const literal = await findNetworkLiteralAt(text, position);
  if (literal?.kind === "ip" && isIP(literal.value))
    return { kind: "ip", ip: literal.value, range: literal.range };
  if (
    literal?.kind === "number" &&
    asn &&
    asn.start === literal.range.column - 1 &&
    asn.end === literal.range.endColumn - 1
  )
    return { kind: "asn", asn: asn.asn, range: literal.range };
  return null;
};
