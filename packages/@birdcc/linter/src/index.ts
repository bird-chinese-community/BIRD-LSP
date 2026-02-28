import { buildCoreSnapshot, type BirdDiagnostic, type CoreSnapshot } from "@birdcc/core";
import { parseBirdConfig, type ParsedBirdDocument } from "@birdcc/parser";

export interface RuleContext {
  text: string;
  parsed: ParsedBirdDocument;
  core: CoreSnapshot;
}

export type BirdRule = (context: RuleContext) => BirdDiagnostic[];

interface BgpBlock {
  name: string;
  start: number;
  end: number;
  line: number;
  column: number;
  body: string;
}

export interface LintResult {
  parsed: ParsedBirdDocument;
  core: CoreSnapshot;
  diagnostics: BirdDiagnostic[];
}

const indexToLineColumn = (text: string, index: number): { line: number; column: number } => {
  const prefix = text.slice(0, index);
  const lines = prefix.split(/\r?\n/);
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
};

const extractBgpBlocks = (text: string): BgpBlock[] => {
  const blocks: BgpBlock[] = [];
  const headerRegex = /\bprotocol\s+bgp\s+([A-Za-z_][\w-]*)\s*\{/gi;

  let match: RegExpExecArray | null;
  while ((match = headerRegex.exec(text)) !== null) {
    const protocolName = match[1];
    const startIndex = match.index;
    const braceStart = headerRegex.lastIndex - 1;
    let cursor = braceStart;
    let depth = 0;

    while (cursor < text.length) {
      const char = text[cursor];
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          break;
        }
      }
      cursor += 1;
    }

    const endIndex = cursor < text.length ? cursor : text.length - 1;
    const body = text.slice(braceStart + 1, endIndex);
    const position = indexToLineColumn(text, startIndex);

    blocks.push({
      name: protocolName,
      start: startIndex,
      end: endIndex,
      line: position.line,
      column: position.column,
      body,
    });
  }

  return blocks;
};

const createProtocolDiagnostic = (
  code: string,
  message: string,
  block: BgpBlock,
): BirdDiagnostic => ({
  code,
  message,
  severity: "warning",
  source: "linter",
  range: {
    line: block.line,
    column: block.column,
    endLine: block.line,
    endColumn: block.column + block.name.length,
  },
});

const bgpLocalAsRule: BirdRule = ({ text }) => {
  const diagnostics: BirdDiagnostic[] = [];
  const blocks = extractBgpBlocks(text);

  for (const block of blocks) {
    if (!/\blocal\s+as\b/i.test(block.body)) {
      diagnostics.push(
        createProtocolDiagnostic(
          "protocol/bgp-missing-local-as",
          `BGP 协议 '${block.name}' 缺少 local as 配置`,
          block,
        ),
      );
    }
  }

  return diagnostics;
};

const bgpNeighborRule: BirdRule = ({ text }) => {
  const diagnostics: BirdDiagnostic[] = [];
  const blocks = extractBgpBlocks(text);

  for (const block of blocks) {
    if (!/\bneighbor\b/i.test(block.body)) {
      diagnostics.push(
        createProtocolDiagnostic(
          "protocol/bgp-missing-neighbor",
          `BGP 协议 '${block.name}' 缺少 neighbor 配置`,
          block,
        ),
      );
    }
  }

  return diagnostics;
};

const defaultRules: BirdRule[] = [bgpLocalAsRule, bgpNeighborRule];

export const lintBirdConfig = (text: string): LintResult => {
  const parsed = parseBirdConfig(text);
  const core = buildCoreSnapshot(text);
  const context: RuleContext = { text, parsed, core };

  const ruleDiagnostics = defaultRules.flatMap((rule) => rule(context));

  return {
    parsed,
    core,
    diagnostics: [...core.diagnostics, ...ruleDiagnostics],
  };
};
