import type { ProtocolStatement, SourceRange } from "../types.js";

type TokenRange = (token: string) => SourceRange;

const stripQuotedText = (value: string): string =>
  value.replace(/^(['"])(.*)\1$/u, "$2");

const parseBoolToken = (value: string | undefined): boolean | undefined => {
  if (!value) {
    return undefined;
  }

  if (/^(yes|on|true)$/iu.test(value)) {
    return true;
  }

  if (/^(no|off|false)$/iu.test(value)) {
    return false;
  }

  return undefined;
};

const splitTopLevelStatements = (body: string): string[] => {
  const statements: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (char === ";" && depth === 0) {
      statements.push(body.slice(start, index));
      start = index + 1;
    }
  }

  const tail = body.slice(start).trim();
  if (tail.length > 0) {
    statements.push(tail);
  }

  return statements;
};

const parseRadvCustomOptionParts = (
  statementText: string,
  tokenRange: TokenRange,
):
  | {
      optionType: string;
      optionTypeRange: SourceRange;
      value: string;
      valueRange: SourceRange;
    }
  | undefined => {
  const customOptionMatch = statementText.match(
    /^custom\s+option\s+type\s+(\S+)\s+value\s+(\S+)$/iu,
  );
  if (!customOptionMatch?.[1] || !customOptionMatch[2]) {
    return undefined;
  }

  const optionType = customOptionMatch[1];
  const value = customOptionMatch[2];
  return {
    optionType,
    optionTypeRange: tokenRange(optionType),
    value,
    valueRange: tokenRange(value),
  };
};

const parseRadvDnsBlockEntries = (
  blockKind: "rdnss" | "dnssl",
  bodyText: string,
  tokenRange: TokenRange,
): Extract<
  Extract<ProtocolStatement, { kind: "radv-interface" }>["entries"][number],
  { kind: "rdnss" | "dnssl" }
>["entries"] => {
  const body = bodyText
    .trim()
    .replace(/^\{\s*/u, "")
    .replace(/\s*\}$/u, "");

  return splitTopLevelStatements(body)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const dnsEntryMatch = item.match(
        /^(ns|domain)\s+(\S+|"[^"]+"|'[^']+')$/iu,
      );
      if (dnsEntryMatch?.[1] && dnsEntryMatch[2]) {
        const entryKind = dnsEntryMatch[1].toLowerCase();
        const valueText = dnsEntryMatch[2];
        return {
          kind: entryKind === "ns" ? "ns" : "domain",
          value: stripQuotedText(valueText),
          valueText,
          valueRange: tokenRange(valueText),
          ...tokenRange(item),
        };
      }

      const lifetimeMatch = item.match(/^lifetime\s+(?:(mult)\s+)?(\S+)$/iu);
      if (lifetimeMatch?.[2]) {
        const multiplierText = lifetimeMatch[1];
        const value = lifetimeMatch[2];
        return {
          kind: "lifetime",
          value,
          valueRange: tokenRange(value),
          multiplier: Boolean(multiplierText),
          multiplierRange: multiplierText
            ? tokenRange(multiplierText)
            : undefined,
          ...tokenRange(item),
        };
      }

      return {
        kind: "other",
        text: item,
        ...tokenRange(item),
      };
    });
};

const parseRadvPrefixEntries = (
  bodyText: string,
  bodyRange: SourceRange,
  tokenRange: TokenRange,
): Extract<
  Extract<ProtocolStatement, { kind: "radv-interface" }>["entries"][number],
  { kind: "prefix" }
>["entries"] => {
  const body = bodyText
    .trim()
    .replace(/^\{\s*/u, "")
    .replace(/\s*\}$/u, "");
  return splitTopLevelStatements(body)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const boolMatch = item.match(
        /^(skip|onlink|autonomous|pd\s+preferred)(?:\s+(\S+))?$/iu,
      );
      if (boolMatch?.[1]) {
        const valueText = boolMatch[2];
        const optionText = boolMatch[1].toLowerCase().replace(/\s+/gu, "-");
        return {
          kind: optionText as "skip" | "onlink" | "autonomous" | "pd-preferred",
          value: parseBoolToken(valueText) ?? true,
          valueText,
          valueRange: valueText ? tokenRange(valueText) : undefined,
          ...bodyRange,
        };
      }

      const lifetimeMatch = item.match(
        /^(valid|preferred)\s+lifetime\s+(\S+)(?:\s+sensitive\s+(\S+))?$/iu,
      );
      if (lifetimeMatch?.[1] && lifetimeMatch[2]) {
        const value = lifetimeMatch[2];
        const sensitiveText = lifetimeMatch[3];
        return {
          kind: "lifetime",
          option:
            lifetimeMatch[1].toLowerCase() === "valid"
              ? "valid-lifetime"
              : "preferred-lifetime",
          value,
          valueRange: tokenRange(value),
          sensitive: parseBoolToken(sensitiveText),
          sensitiveText,
          sensitiveRange: sensitiveText ? tokenRange(sensitiveText) : undefined,
          ...bodyRange,
        };
      }

      return {
        kind: "other",
        text: item,
        ...bodyRange,
      };
    });
};

const parseRadvInterfaceEntries = (
  bodyText: string,
  bodyRange: SourceRange,
  tokenRange: TokenRange,
): Extract<ProtocolStatement, { kind: "radv-interface" }>["entries"] => {
  const body = bodyText
    .trim()
    .replace(/^\{\s*/u, "")
    .replace(/\s*\}$/u, "");
  const statements = splitTopLevelStatements(body);
  return statements
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const prefixMatch = item.match(/^prefix\s+(\S+)(?:\s+(\{[\s\S]*\}))?$/iu);
      if (prefixMatch?.[1]) {
        const prefix = prefixMatch[1];
        const prefixBodyText = prefixMatch[2];
        const prefixBodyRange = prefixBodyText
          ? tokenRange(prefixBodyText)
          : undefined;
        return {
          kind: "prefix",
          prefix,
          prefixRange: tokenRange(prefix),
          entries: prefixBodyText
            ? parseRadvPrefixEntries(prefixBodyText, bodyRange, tokenRange)
            : [],
          bodyText: prefixBodyText,
          bodyRange: prefixBodyRange,
          ...bodyRange,
        };
      }

      const timerMatch = item.match(
        /^(min\s+ra\s+interval|max\s+ra\s+interval|min\s+delay)\s+(.+)$/iu,
      );
      if (timerMatch?.[1] && timerMatch[2]) {
        const value = timerMatch[2].trim();
        return {
          kind: "timer",
          option: timerMatch[1].toLowerCase().replace(/\s+/gu, "-") as
            | "min-ra-interval"
            | "max-ra-interval"
            | "min-delay",
          value,
          valueRange: tokenRange(value),
          ...bodyRange,
        };
      }

      const boolMatch = item.match(
        /^(solicited\s+ra\s+unicast|managed|other\s+config)(?:\s+(\S+))?$/iu,
      );
      if (boolMatch?.[1]) {
        const valueText = boolMatch[2];
        return {
          kind: "bool",
          option: boolMatch[1].toLowerCase().replace(/\s+/gu, "-") as
            | "solicited-ra-unicast"
            | "managed"
            | "other-config",
          value: parseBoolToken(valueText) ?? true,
          valueText,
          valueRange: valueText ? tokenRange(valueText) : undefined,
          ...bodyRange,
        };
      }

      const scalarMatch = item.match(
        /^(link\s+mtu|reachable\s+time|retrans\s+timer|current\s+hop\s+limit)\s+(.+)$/iu,
      );
      if (scalarMatch?.[1] && scalarMatch[2]) {
        const value = scalarMatch[2].trim();
        return {
          kind: "scalar",
          option: scalarMatch[1].toLowerCase().replace(/\s+/gu, "-") as
            | "link-mtu"
            | "reachable-time"
            | "retrans-timer"
            | "current-hop-limit",
          value,
          valueRange: tokenRange(value),
          ...bodyRange,
        };
      }

      const localMatch = item.match(
        /^(rdnss|dnssl|custom\s+option)\s+local(?:\s+(\S+))?$/iu,
      );
      if (localMatch?.[1]) {
        const option = `${localMatch[1].toLowerCase().replace(/\s+/gu, "-")}-local`;
        const valueText = localMatch[2];
        return {
          kind: "local",
          option: option as
            | "rdnss-local"
            | "dnssl-local"
            | "custom-option-local",
          value: parseBoolToken(valueText) ?? true,
          valueText,
          valueRange: valueText ? tokenRange(valueText) : undefined,
          ...bodyRange,
        };
      }

      const dnsBlockMatch = item.match(/^(rdnss|dnssl)\s+(\{[\s\S]*\})$/iu);
      if (dnsBlockMatch?.[1] && dnsBlockMatch[2]) {
        const kind = dnsBlockMatch[1].toLowerCase() as "rdnss" | "dnssl";
        const dnsBodyText = dnsBlockMatch[2];
        return {
          kind,
          entries: parseRadvDnsBlockEntries(kind, dnsBodyText, tokenRange),
          bodyText: dnsBodyText,
          bodyRange: tokenRange(dnsBodyText),
          ...bodyRange,
        };
      }

      const customOption = parseRadvCustomOptionParts(item, tokenRange);
      if (customOption) {
        return {
          kind: "custom-option",
          ...customOption,
          ...bodyRange,
        };
      }

      return {
        kind: "other",
        text: item,
        ...bodyRange,
      };
    });
};

export const parseRadvInterfaceTextStatement = (
  statementText: string,
  statementRange: SourceRange,
  tokenRange: TokenRange,
): ProtocolStatement | undefined => {
  const trimmed = statementText.trim().replace(/;\s*$/u, "");
  const interfaceMatch = trimmed.match(/^interface\b(.*)$/isu);
  const rest = interfaceMatch?.[1]?.trim();
  if (!rest) {
    return undefined;
  }

  const bodyMatch = rest.match(/\{[\s\S]*\}$/u);
  const bodyText = bodyMatch?.[0];
  if (!bodyText) {
    return undefined;
  }

  const patternText = rest.slice(0, rest.indexOf(bodyText)).trim();
  const patternMatches = [...patternText.matchAll(/"[^"]+"|'[^']+'|\S+/gu)];
  const patterns = patternMatches.map((match) => stripQuotedText(match[0]));
  const patternRanges = patternMatches.map((match) => tokenRange(match[0]));
  const bodyRange = tokenRange(bodyText);

  return {
    kind: "radv-interface",
    patterns,
    patternRanges,
    entries: parseRadvInterfaceEntries(bodyText, bodyRange, tokenRange),
    bodyText,
    bodyRange,
    ...statementRange,
  };
};

export const parseRadvOptionTextStatement = (
  statementText: string,
  statementRange: SourceRange,
  tokenRange: TokenRange,
): ProtocolStatement | undefined => {
  const trimmed = statementText.trim().replace(/;\s*$/u, "");
  const propagateRoutesMatch = trimmed.match(/^propagate\s+routes\s+(\S+)$/iu);
  if (propagateRoutesMatch?.[1]) {
    const valueText = propagateRoutesMatch[1];
    return {
      kind: "radv-option",
      option: "propagate-routes",
      value: parseBoolToken(valueText) ?? true,
      valueText,
      valueRange: tokenRange(valueText),
      ...statementRange,
    };
  }

  const triggerMatch = trimmed.match(/^trigger\s+(\S+)$/iu);
  if (triggerMatch?.[1]) {
    const prefix = triggerMatch[1];
    return {
      kind: "radv-trigger",
      prefix,
      prefixRange: tokenRange(prefix),
      ...statementRange,
    };
  }

  return undefined;
};

export const parseRadvPrefixTextStatement = (
  statementText: string,
  statementRange: SourceRange,
  tokenRange: TokenRange,
): ProtocolStatement | undefined => {
  const trimmed = statementText.trim().replace(/;\s*$/u, "");
  const prefixMatch = trimmed.match(/^prefix\s+(\S+)(?:\s+(\{[\s\S]*\}))?$/iu);
  if (!prefixMatch?.[1]) {
    return undefined;
  }

  const prefix = prefixMatch[1];
  const bodyText = prefixMatch[2];
  const bodyRange = bodyText ? tokenRange(bodyText) : undefined;
  return {
    kind: "radv-prefix",
    prefix,
    prefixRange: tokenRange(prefix),
    entries: bodyText
      ? parseRadvPrefixEntries(bodyText, statementRange, tokenRange)
      : [],
    bodyText,
    bodyRange,
    ...statementRange,
  };
};

export const parseRadvDnsTextStatement = (
  statementText: string,
  statementRange: SourceRange,
  tokenRange: TokenRange,
): ProtocolStatement | undefined => {
  const trimmed = statementText.trim().replace(/;\s*$/u, "");
  const dnsBlockMatch = trimmed.match(/^(rdnss|dnssl)\s+(\{[\s\S]*\})$/iu);
  if (!dnsBlockMatch?.[1] || !dnsBlockMatch[2]) {
    return undefined;
  }

  const block = dnsBlockMatch[1].toLowerCase() as "rdnss" | "dnssl";
  const bodyText = dnsBlockMatch[2];
  return {
    kind: "radv-dns",
    block,
    entries: parseRadvDnsBlockEntries(block, bodyText, tokenRange),
    bodyText,
    bodyRange: tokenRange(bodyText),
    ...statementRange,
  };
};

export const parseRadvCustomOptionTextStatement = (
  statementText: string,
  statementRange: SourceRange,
  tokenRange: TokenRange,
): ProtocolStatement | undefined => {
  const trimmed = statementText.trim().replace(/;\s*$/u, "");
  const customOption = parseRadvCustomOptionParts(trimmed, tokenRange);
  if (!customOption) {
    return undefined;
  }

  return {
    kind: "radv-custom-option",
    ...customOption,
    ...statementRange,
  };
};
