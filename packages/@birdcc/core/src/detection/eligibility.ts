import { basename } from "node:path";
import { parseBirdConfig, type ParsedBirdDocument } from "@birdcc/parser";
import type {
  BirdDeclarationEvidence,
  BirdDocumentEligibility,
  BirdDocumentEligibilityOptions,
} from "./types.js";

const CANONICAL_BIRD_CONFIG_RE = /^\.?bird(?:2|3|6)?\.conf$/i;

const BIRD_PROTOCOL_TYPES = new Set([
  "aggregator",
  "babel",
  "bfd",
  "bgp",
  "bmp",
  "bridge",
  "device",
  "direct",
  "evpn",
  "kernel",
  "l3vpn",
  "mrt",
  "ospf",
  "ospf2",
  "ospf3",
  "perf",
  "pipe",
  "radv",
  "rip",
  "rip2",
  "ripng",
  "rpki",
  "static",
]);

const QUALIFYING_DECLARATION_KINDS = new Set<BirdDeclarationEvidence>([
  "router-id",
  "include",
  "define",
  "graceful-restart-wait",
  "hostname-override",
  "attribute",
  "table",
  "mpls-domain",
  "filter",
  "function",
  "template",
  "protocol",
  "timeformat",
  "watchdog",
]);

const isQualifyingDeclarationKind = (
  kind: string,
): kind is BirdDeclarationEvidence =>
  QUALIFYING_DECLARATION_KINDS.has(kind as BirdDeclarationEvidence);

export const isCanonicalBirdConfigPath = (filePath: string): boolean =>
  CANONICAL_BIRD_CONFIG_RE.test(basename(filePath));

export const collectBirdDeclarationEvidence = (
  parsed: ParsedBirdDocument,
): BirdDeclarationEvidence[] => {
  const evidence = new Set<BirdDeclarationEvidence>();

  for (const declaration of parsed.program.declarations) {
    if (!isQualifyingDeclarationKind(declaration.kind)) {
      continue;
    }

    if (declaration.kind === "protocol") {
      const protocolType = declaration.protocolType?.toLowerCase();
      if (!protocolType || !BIRD_PROTOCOL_TYPES.has(protocolType)) {
        continue;
      }
    }

    evidence.add(declaration.kind);
  }

  return [...evidence].sort();
};

export const evaluateParsedBirdDocumentEligibility = (
  parsed: ParsedBirdDocument,
  options?: BirdDocumentEligibilityOptions,
): BirdDocumentEligibility => {
  const declarationKinds = collectBirdDeclarationEvidence(parsed);

  if (options?.explicitMain) {
    return {
      eligible: true,
      reason: "explicit-main",
      declarationKinds,
    };
  }

  if (options?.filePath && isCanonicalBirdConfigPath(options.filePath)) {
    return {
      eligible: true,
      reason: "canonical-filename",
      declarationKinds,
    };
  }

  if (declarationKinds.length > 0) {
    return {
      eligible: true,
      reason: "semantic-evidence",
      declarationKinds,
    };
  }

  return {
    eligible: false,
    reason: "no-evidence",
    declarationKinds,
  };
};

export const evaluateBirdDocumentEligibility = async (
  text: string,
  options?: BirdDocumentEligibilityOptions,
): Promise<BirdDocumentEligibility> => {
  try {
    const parsed = await parseBirdConfig(text);
    return evaluateParsedBirdDocumentEligibility(parsed, options);
  } catch {
    if (options?.explicitMain) {
      return {
        eligible: true,
        reason: "explicit-main",
        declarationKinds: [],
      };
    }

    if (options?.filePath && isCanonicalBirdConfigPath(options.filePath)) {
      return {
        eligible: true,
        reason: "canonical-filename",
        declarationKinds: [],
      };
    }

    return {
      eligible: false,
      reason: "no-evidence",
      declarationKinds: [],
    };
  }
};
