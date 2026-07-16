/**
 * Lightweight content scanner — reads first 64KB of a file to extract
 * structural signals without a full parse.
 */

import { open } from "node:fs/promises";
import { join } from "node:path";
import { parseBirdConfig, type ParsedBirdDocument } from "@birdcc/parser";
import { scanBraceDepth } from "./brace-scanner.js";
import { evaluateParsedBirdDocumentEligibility } from "./eligibility.js";
import type { BirdDocumentEligibility, ContentSignals } from "./types.js";

/** Maximum bytes to read per file for content scanning */
const MAX_SCAN_BYTES = 64 * 1024;

const PROTOCOL_DEVICE_RE = /\bprotocol\s+device\b/i;
const PROTOCOL_KERNEL_RE = /\bprotocol\s+kernel\b/i;
const LOG_DIRECTIVE_RE = /\blog\s+(syslog|stderr|")/i;
const PROTOCOL_BLOCK_RE = /\bprotocol\s+\w+/i;
const DEFINE_RE = /\bdefine\b/i;
const INCLUDE_RE = /^[ \t]*include\s+"([^"]+)"\s*;/;
const COMMENTED_INCLUDE_RE = /^[ \t]*#\s*include\s+"([^"]+)"\s*;?/;

/**
 * Reads the first 64KB of a file and returns the text content.
 * Returns null if the file cannot be read.
 */
export const readFileHead = async (
  filePath: string,
): Promise<string | null> => {
  let handle;
  try {
    handle = await open(filePath, "r");
    const buffer = Buffer.alloc(MAX_SCAN_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, MAX_SCAN_BYTES, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
};

/**
 * Extract content-level signals from file text.
 */
export const extractContentSignals = (content: string): ContentSignals => {
  const braceResult = scanBraceDepth(content);
  const lines = content.split("\n");

  const includeStatements: string[] = [];
  const commentedIncludes: string[] = [];
  let hasProtocolDevice = false;
  let hasProtocolKernel = false;
  let hasLogDirective = false;
  let hasProtocolBlock = false;
  let hasDefine = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (trimmed.length === 0) continue;

    // Check for commented includes (must check before stripping comments)
    const commentedMatch = trimmed.match(COMMENTED_INCLUDE_RE);
    if (commentedMatch) {
      commentedIncludes.push(commentedMatch[1]);
      continue;
    }

    // Check for active includes
    const includeMatch = trimmed.match(INCLUDE_RE);
    if (includeMatch) {
      includeStatements.push(includeMatch[1]);
      continue;
    }

    // Skip lines that are pure comments
    if (trimmed.startsWith("#")) continue;

    if (!hasProtocolDevice && PROTOCOL_DEVICE_RE.test(trimmed)) {
      hasProtocolDevice = true;
    }
    if (!hasProtocolKernel && PROTOCOL_KERNEL_RE.test(trimmed)) {
      hasProtocolKernel = true;
    }
    if (!hasLogDirective && LOG_DIRECTIVE_RE.test(trimmed)) {
      hasLogDirective = true;
    }
    if (!hasProtocolBlock && PROTOCOL_BLOCK_RE.test(trimmed)) {
      hasProtocolBlock = true;
    }
    if (!hasDefine && DEFINE_RE.test(trimmed)) {
      hasDefine = true;
    }
  }

  return {
    hasGlobalRouterId: braceResult.globalRouterIdLines.length > 0,
    hasProtocolRouterIdOnly:
      braceResult.protocolRouterIdLines.length > 0 &&
      braceResult.globalRouterIdLines.length === 0,
    hasProtocolDevice,
    hasProtocolKernel,
    hasLogDirective,
    hasProtocolBlock,
    hasDefine,
    includeStatements,
    commentedIncludes,
  };
};

const extractParsedContentSignals = (
  content: string,
  parsed: ParsedBirdDocument,
): ContentSignals => {
  const legacySignals = extractContentSignals(content);
  const protocols = parsed.program.declarations.filter(
    (declaration) => declaration.kind === "protocol",
  );
  const hasGlobalRouterId = parsed.program.declarations.some(
    (declaration) => declaration.kind === "router-id",
  );

  return {
    hasGlobalRouterId,
    hasProtocolRouterIdOnly:
      !hasGlobalRouterId &&
      protocols.some((protocol) =>
        protocol.statements.some(
          (statement) => statement.kind === "protocol-router-id",
        ),
      ),
    hasProtocolDevice: protocols.some(
      (protocol) => protocol.protocolType?.toLowerCase() === "device",
    ),
    hasProtocolKernel: protocols.some(
      (protocol) => protocol.protocolType?.toLowerCase() === "kernel",
    ),
    hasLogDirective: legacySignals.hasLogDirective,
    hasProtocolBlock: protocols.length > 0,
    hasDefine: parsed.program.declarations.some(
      (declaration) => declaration.kind === "define",
    ),
    includeStatements: parsed.program.declarations
      .filter((declaration) => declaration.kind === "include")
      .map((declaration) => declaration.path),
    commentedIncludes: legacySignals.commentedIncludes,
  };
};

export interface ScannedFileAnalysis {
  signals: ContentSignals;
  eligibility: BirdDocumentEligibility;
}

export const analyzeFileContent = async (
  root: string,
  relativePath: string,
  explicitMain: boolean = false,
): Promise<ScannedFileAnalysis | null> => {
  const content = await readFileHead(join(root, relativePath));
  if (content === null) return null;

  try {
    const parsed = await parseBirdConfig(content);
    return {
      signals: extractParsedContentSignals(content, parsed),
      eligibility: evaluateParsedBirdDocumentEligibility(parsed, {
        filePath: relativePath,
        explicitMain,
      }),
    };
  } catch {
    return null;
  }
};

/**
 * Scan a file: read head + extract signals.
 */
export const scanFileContent = async (
  root: string,
  relativePath: string,
): Promise<ContentSignals | null> => {
  const analysis = await analyzeFileContent(root, relativePath);
  return analysis?.signals ?? null;
};
