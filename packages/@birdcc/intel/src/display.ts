import { countryCodeToFlag } from "./country-flag.js";
import type { AsnEntry, AsnDisplayInfo } from "./types.js";

const ASN_INLAY_MAX_DIGITS = 6;

/**
 * Format an AsnEntry into display strings for LSP features (inlay hints, completion, hover).
 */
export const formatAsnDisplay = (entry: AsnEntry): AsnDisplayInfo => {
  const flag = countryCodeToFlag(entry.cc);
  const asnStr = `AS${entry.asn}`;

  // Inlay hint: "🇺🇸 AS13335" — truncate ASN string if > 6 digits
  const asnDigits = String(entry.asn);
  const truncatedAsn =
    asnDigits.length > ASN_INLAY_MAX_DIGITS
      ? `AS${asnDigits.slice(0, ASN_INLAY_MAX_DIGITS)}..`
      : asnStr;
  const inlayLabel = flag ? `${flag} ${truncatedAsn}` : truncatedAsn;

  // Completion detail: "🇺🇸 AS13335 · Cloudflare, Inc."
  const completionDetail = flag
    ? `${flag} ${asnStr} · ${entry.name}`
    : `${asnStr} · ${entry.name}`;

  // Rich hover markdown
  const hoverLines: string[] = [
    `### ${flag ? `${flag} ` : ""}${asnStr}`,
    "",
    `| | |`,
    `|---|---|`,
    `| **AS Name** | ${entry.name} |`,
    `| **ASN** | ${entry.asn} |`,
  ];

  if (entry.cc) {
    hoverLines.push(`| **Country** | ${flag} ${entry.cc} |`);
  }
  if (entry.cls) {
    hoverLines.push(`| **Type** | ${entry.cls} |`);
  }

  hoverLines.push(
    "",
    `---`,
    `*Data: [BGP.Tools OpenDB](https://github.com/Alice39s/BGP.Tools-OpenDB)*`,
  );

  const hoverMarkdown = hoverLines.join("\n");

  return { inlayLabel, completionDetail, hoverMarkdown };
};
