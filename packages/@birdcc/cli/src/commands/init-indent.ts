import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const INDENT_CANDIDATES = [2, 4, 8] as const;
const MIN_CONFIDENCE_TO_APPLY = 60;
const MAX_SAMPLED_FILES = 5;

export interface IndentDetectionResult {
  indentSize?: number;
  confidence: number;
  samples: number;
}

interface IndentProbeLine {
  indent: number;
  text: string;
}

const isCommentLikeLine = (value: string): boolean =>
  value.startsWith("#") || value.startsWith("//");

const collectProbeLines = (text: string): IndentProbeLine[] => {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const output: IndentProbeLine[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || isCommentLikeLine(trimmed)) {
      continue;
    }

    const leading = line.match(/^[ \t]*/u)?.[0] ?? "";
    if (leading.includes("\t")) {
      continue;
    }

    const indent = leading.length;
    output.push({ indent, text: trimmed });
  }

  return output;
};

export const detectIndentSizeFromText = (
  text: string,
): IndentDetectionResult => {
  const lines = collectProbeLines(text);
  if (lines.length === 0) {
    return { confidence: 0, samples: 0 };
  }

  const scores = new Map<number, number>(
    INDENT_CANDIDATES.map((candidate) => [candidate, 0]),
  );
  let samples = 0;

  for (const line of lines) {
    if (line.indent <= 0) {
      continue;
    }

    for (const candidate of INDENT_CANDIDATES) {
      if (line.indent % candidate === 0) {
        scores.set(candidate, (scores.get(candidate) ?? 0) + 1);
      }
    }
    samples += 1;
  }

  for (let index = 1; index < lines.length; index += 1) {
    const previous = lines[index - 1];
    const current = lines[index];
    if (!previous || !current || current.indent <= previous.indent) {
      continue;
    }

    const delta = current.indent - previous.indent;
    for (const candidate of INDENT_CANDIDATES) {
      if (delta === candidate) {
        scores.set(candidate, (scores.get(candidate) ?? 0) + 3);
        samples += 1;
      } else if (delta % candidate === 0) {
        scores.set(candidate, (scores.get(candidate) ?? 0) + 1);
      }
    }
  }

  const ranked = [...scores.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return left[0] - right[0];
  });

  const best = ranked[0];
  const second = ranked[1];
  if (!best || best[1] <= 0) {
    return { confidence: 0, samples };
  }

  const confidenceBase = Math.max(samples, 1);
  const confidence = Math.max(
    0,
    Math.min(100, Math.round((best[1] / confidenceBase) * 100)),
  );

  if (second && best[1] === second[1]) {
    return { confidence: Math.min(confidence, 40), samples };
  }

  return {
    indentSize: confidence >= MIN_CONFIDENCE_TO_APPLY ? best[0] : undefined,
    confidence,
    samples,
  };
};

export const detectIndentSizeFromFiles = async (
  root: string,
  relativePaths: readonly string[],
): Promise<IndentDetectionResult> => {
  const scored = new Map<number, number>(
    INDENT_CANDIDATES.map((candidate) => [candidate, 0]),
  );
  let totalSamples = 0;

  for (const relativePath of relativePaths.slice(0, MAX_SAMPLED_FILES)) {
    try {
      const text = await readFile(resolve(root, relativePath), "utf8");
      const result = detectIndentSizeFromText(text);
      totalSamples += result.samples;

      if (!result.indentSize) {
        continue;
      }

      scored.set(
        result.indentSize,
        (scored.get(result.indentSize) ?? 0) + result.confidence,
      );
    } catch {
      continue;
    }
  }

  const ranked = [...scored.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return left[0] - right[0];
  });

  const best = ranked[0];
  const second = ranked[1];
  if (!best || best[1] <= 0) {
    return { confidence: 0, samples: totalSamples };
  }

  const totalScore = ranked.reduce((sum, [, score]) => sum + score, 0);
  const confidence =
    totalScore > 0 ? Math.round((best[1] / totalScore) * 100) : 0;

  if (second && best[1] === second[1]) {
    return { confidence: Math.min(confidence, 40), samples: totalSamples };
  }

  return {
    indentSize: confidence >= MIN_CONFIDENCE_TO_APPLY ? best[0] : undefined,
    confidence,
    samples: totalSamples,
  };
};
