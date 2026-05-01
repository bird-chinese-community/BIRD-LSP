type AsnMatch = {
  asn: number;
  start: number;
  end: number;
};

type PatternMatchConfig = {
  captureGroup?: number;
  isAllowed?: (match: RegExpExecArray, asn: number) => boolean;
};

const ASN_LIKE_DEFINE_NAME = /(?:^|_)(?:ASN|COMMUNITY)(?:_|$)/i;
const COMMENT_ASN_CONTEXT = /(?:^|\s)#\s*AS(\d+)$/i;
const SHORT_ASN_EXEMPTIONS = new Set([42]);
const MIN_REGULAR_ASN = 100;

const COMPLETION_CONTEXT_PATTERNS = [
  /\blocal\s+as\s+(\d+)$/i,
  /\b(?:bgp_)?community\.add\(\(\s*(\d+)$/i,
  /\b(?:bgp_)?large_community\.add\(\(\s*(\d+)$/i,
  /\bbgp_path\.(?:prepend|delete)\(\s*(\d+)$/i,
  /\bbgp_path\s*~\s*\[[^\]]*?(\d+)$/i,
];

/**
 * CODE_ASN_PATTERNS — regex patterns for detecting ASN values in BIRD config lines.
 *
 * Patterns in the "guaranteed" group match contexts where BIRD grammar
 * guarantees the value is an ASN (e.g. `local as <n>`, `bgp_path.prepend(<n>)`).
 * These accept any positive integer, including historical short ASNs (< 100).
 *
 * Patterns in the "heuristic" group match contexts where the numeric value
 * might not be an ASN (e.g. `define`, `community.add`). These use `isLikelyAsn`
 * to filter out values unlikely to be AS numbers.
 */
const CODE_ASN_PATTERNS: Array<[RegExp, PatternMatchConfig?]> = [
  // --- guaranteed ASN contexts ---
  [/\blocal\s+as\s+(\d+)\b/gi, { isAllowed: (_match, asn) => asn > 0 }],
  [
    /\bbgp_path\.(?:prepend|delete)\(\s*(\d+)\b/gi,
    { isAllowed: (_match, asn) => asn > 0 },
  ],
  // --- heuristic ASN contexts ---
  [
    /\bdefine\s+([A-Za-z_]\w*)\s*=\s*(\d+)\b/gi,
    {
      captureGroup: 2,
      isAllowed: (match, asn) =>
        ASN_LIKE_DEFINE_NAME.test(match[1] ?? "") && isLikelyAsn(asn),
    },
  ],
  [
    /\b(?:bgp_)?community\.add\(\(\s*(\d+)\s*,/gi,
    {
      isAllowed: (_match, asn) =>
        asn !== 0 && asn !== 65535 && isLikelyAsn(asn),
    },
  ],
  [
    /\b(?:bgp_)?large_community\.add\(\(\s*(\d+)\s*,/gi,
    {
      isAllowed: (_match, asn) => isLikelyAsn(asn),
    },
  ],
  [
    /\(\s*(\d+)\s*,\s*\d+\s*\)\s*~\s*(?:bgp_)?community\b/gi,
    {
      isAllowed: (_match, asn) =>
        asn !== 0 && asn !== 65535 && isLikelyAsn(asn),
    },
  ],
];

const BGP_PATH_ARRAY_PATTERN = /\bbgp_path\s*~\s*\[([^\]]*)\]/gi;
const BGP_PATH_ARRAY_NUMBER_PATTERN = /\d+/g;

const isLikelyAsn = (asn: number): boolean =>
  SHORT_ASN_EXEMPTIONS.has(asn) || asn >= MIN_REGULAR_ASN;

type NeighborAsMatch = {
  digits: string;
  digitStart: number;
};

const findNeighborAsMatch = (lineText: string): NeighborAsMatch | null => {
  const neighborIndex = lineText.search(/\bneighbor\b/i);
  if (neighborIndex === -1) return null;

  const asMatch = /\bas\s+(\d+)\b/i.exec(lineText.slice(neighborIndex));
  if (!asMatch || !asMatch[1]) return null;

  return {
    digits: asMatch[1],
    digitStart:
      neighborIndex +
      (asMatch.index ?? 0) +
      asMatch[0].length -
      asMatch[1].length,
  };
};

const collectNeighborAsMatches = (lineText: string): AsnMatch[] => {
  const matches: AsnMatch[] = [];
  const match = findNeighborAsMatch(lineText);
  if (!match) return matches;

  const asn = Number.parseInt(match.digits, 10);
  if (Number.isNaN(asn) || asn <= 0) return matches;

  matches.push({
    asn,
    start: match.digitStart,
    end: match.digitStart + match.digits.length,
  });

  return matches;
};

const maskNonCodeSegments = (lineText: string): string => {
  let masked = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (let index = 0; index < lineText.length; index++) {
    const char = lineText[index];
    const next = lineText[index + 1];

    if (quote) {
      masked += " ";
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === quote) {
        quote = null;
      }

      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      masked += " ";
      continue;
    }

    if (char === "#" || (char === "/" && next === "/")) {
      masked += " ".repeat(lineText.length - index);
      break;
    }

    masked += char;
  }

  return masked.padEnd(lineText.length, " ");
};

const collectMatchesFromPattern = (
  lineText: string,
  pattern: RegExp,
  config?: PatternMatchConfig,
): AsnMatch[] => {
  const matches: AsnMatch[] = [];
  const captureGroup = config?.captureGroup ?? 1;
  pattern.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(lineText)) !== null) {
    const digits = match[captureGroup];
    if (!digits) continue;

    const asn = Number.parseInt(digits, 10);
    if (Number.isNaN(asn) || asn <= 0) continue;
    if (!config?.isAllowed && !isLikelyAsn(asn)) continue;
    if (config?.isAllowed && !config.isAllowed(match, asn)) continue;

    const digitStart = match.index + match[0].lastIndexOf(digits);
    matches.push({
      asn,
      start: digitStart,
      end: digitStart + digits.length,
    });
  }

  return matches;
};

const collectBgpPathArrayMatches = (lineText: string): AsnMatch[] => {
  const matches: AsnMatch[] = [];
  BGP_PATH_ARRAY_PATTERN.lastIndex = 0;

  let arrayMatch: RegExpExecArray | null;
  while ((arrayMatch = BGP_PATH_ARRAY_PATTERN.exec(lineText)) !== null) {
    const arrayBody = arrayMatch[1] ?? "";
    const bodyOffset = arrayMatch.index + arrayMatch[0].indexOf(arrayBody);

    BGP_PATH_ARRAY_NUMBER_PATTERN.lastIndex = 0;
    let numberMatch: RegExpExecArray | null;
    while (
      (numberMatch = BGP_PATH_ARRAY_NUMBER_PATTERN.exec(arrayBody)) !== null
    ) {
      const digits = numberMatch[0];
      const asn = Number.parseInt(digits, 10);
      // bgp_path arrays semantically only contain ASNs — accept any positive integer
      if (Number.isNaN(asn) || asn <= 0) continue;

      const start = bodyOffset + numberMatch.index;
      matches.push({
        asn,
        start,
        end: start + digits.length,
      });
    }
  }

  return matches;
};

const extractDefineAsnPrefix = (linePrefix: string): string | undefined => {
  const match = /\bdefine\s+([A-Za-z_]\w*)\s*=\s*(\d+)$/i.exec(linePrefix);
  if (!match) return undefined;
  if (!ASN_LIKE_DEFINE_NAME.test(match[1] ?? "")) return undefined;
  if (!isLikelyAsn(Number.parseInt(match[2], 10))) return undefined;
  return match[2];
};

export const findAsnMatchesInLine = (lineText: string): AsnMatch[] => {
  const matches: AsnMatch[] = [];
  const maskedLine = maskNonCodeSegments(lineText);

  matches.push(...collectNeighborAsMatches(maskedLine));

  for (const [pattern, config] of CODE_ASN_PATTERNS) {
    matches.push(...collectMatchesFromPattern(maskedLine, pattern, config));
  }

  matches.push(...collectBgpPathArrayMatches(maskedLine));
  matches.sort((left, right) => left.start - right.start);

  return matches;
};

export const extractAsnPrefix = (linePrefix: string): string | undefined => {
  const commentMatch = COMMENT_ASN_CONTEXT.exec(linePrefix);
  if (commentMatch && isLikelyAsn(Number.parseInt(commentMatch[1], 10))) {
    return commentMatch[1];
  }

  const neighborMatch = /\bneighbor\b[^\n;#{}]*\bas\s+(\d+)$/i.exec(linePrefix);
  if (neighborMatch && isLikelyAsn(Number.parseInt(neighborMatch[1], 10))) {
    return neighborMatch[1];
  }

  for (const pattern of COMPLETION_CONTEXT_PATTERNS) {
    const match = pattern.exec(linePrefix);
    if (match && isLikelyAsn(Number.parseInt(match[1], 10))) {
      return match[1];
    }
  }

  return extractDefineAsnPrefix(linePrefix);
};
