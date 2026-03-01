import { resolveCrossFileReferences } from "@birdcc/core";
import { lintResolvedCrossFileGraph } from "@birdcc/linter";
import { describe, expect, it } from "vitest";

interface PerfCase {
  name: string;
  includeCount: number;
  linesPerInclude: number;
  baselineMs: number;
}

const PERF_CASES: PerfCase[] = [
  { name: "small", includeCount: 2, linesPerInclude: 80, baselineMs: 120 },
  { name: "medium", includeCount: 8, linesPerInclude: 220, baselineMs: 320 },
  { name: "large", includeCount: 20, linesPerInclude: 500, baselineMs: 600 },
];

const createIncludeBody = (index: number, linesPerInclude: number): string => {
  const lines: string[] = [];
  lines.push(`template bgp tpl_${index} { local as ${65000 + index}; }`);
  lines.push(`filter export_${index} { accept; }`);

  for (let line = 0; line < linesPerInclude; line += 1) {
    lines.push(`define DEF_${index}_${line} = ${line};`);
  }

  return `${lines.join("\n")}\n`;
};

const createCaseDocuments = (
  testCase: PerfCase,
): { entryUri: string; documents: Array<{ uri: string; text: string }> } => {
  const entryUri = `memory://perf/${testCase.name}/main.conf`;
  const documents: Array<{ uri: string; text: string }> = [];
  const entryLines: string[] = ["router id 192.0.2.1;"];

  for (let index = 0; index < testCase.includeCount; index += 1) {
    const includePath = `include-${index}.conf`;
    const includeUri = `memory://perf/${testCase.name}/${includePath}`;

    entryLines.push(`include "${includePath}";`);
    entryLines.push(`protocol bgp edge_${index} from tpl_${index} {`);
    entryLines.push(`  neighbor 192.0.2.${index + 1} as ${65100 + index};`);
    entryLines.push(`  local as ${65000 + index};`);
    entryLines.push(`  import filter export_${index};`);
    entryLines.push("}");

    documents.push({
      uri: includeUri,
      text: createIncludeBody(index, testCase.linesPerInclude),
    });
  }

  documents.push({
    uri: entryUri,
    text: `${entryLines.join("\n")}\n`,
  });

  return { entryUri, documents };
};

const runPerfCase = async (testCase: PerfCase): Promise<number> => {
  const { entryUri, documents } = createCaseDocuments(testCase);
  const start = performance.now();

  const resolved = await resolveCrossFileReferences({
    entryUri,
    documents,
    loadFromFileSystem: false,
    maxDepth: 16,
    maxFiles: 256,
  });
  await lintResolvedCrossFileGraph(resolved);

  return performance.now() - start;
};

describe("@birdcc/lsp perf baseline", () => {
  it("collects cross-file baseline and emits threshold warnings", async () => {
    for (const testCase of PERF_CASES) {
      await runPerfCase(testCase);
      const elapsed = await runPerfCase(testCase);

      if (elapsed > testCase.baselineMs * 2) {
        // Non-blocking alert: keep collecting baseline before enabling hard gates.
        console.warn(
          `[perf-warning] ${testCase.name} case took ${elapsed.toFixed(1)}ms (baseline ${testCase.baselineMs}ms, threshold ${
            testCase.baselineMs * 2
          }ms)`,
        );
      }

      expect(elapsed).toBeGreaterThan(0);
    }
  });
});
