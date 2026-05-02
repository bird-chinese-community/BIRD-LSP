/**
 * JSON output type definitions for birdcc CLI commands.
 *
 * These types describe the structured (--json / --format json) output
 * of each command. External tooling can import them for type-safe parsing:
 *
 *   import type { BirdLintJsonOutput } from "@birdcc/cli/output-types";
 */

// ── Shared ──────────────────────────────────────────────────────────

export interface SpanLabel {
  /** Byte offset from start of file */
  offset: number;
  /** Byte length of the span */
  length: number;
  /** 1-based line number */
  line: number;
  /** 1-based column number */
  column: number;
}

export interface FileRange {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

// ── Lint ────────────────────────────────────────────────────────────

export interface BirdLintDiagnostic {
  code: string;
  message: string;
  severity: "error" | "warning" | "info";
  source: "parser" | "core" | "linter" | "bird";
  range: FileRange;
  /** file:// URI of the source file */
  uri?: string;
  /** Link to rule documentation */
  url?: string;
  /** Actionable fix hint */
  help?: string;
  /** Reserved for related causes (future) */
  causes: BirdLintDiagnostic[];
  /** Reserved for related diagnostics (future) */
  related: BirdLintDiagnostic[];
  /** Span labels */
  labels: SpanLabel[];
}

export interface BirdLintJsonOutput {
  diagnostics: BirdLintDiagnostic[];
  /** Number of files checked */
  files: number;
  /** Number of lint rules applied */
  rules: number;
  /** Error count */
  errors: number;
  /** Warning count */
  warnings: number;
  /** Total elapsed time in milliseconds */
  elapsedMs: number;
}

/** Fields added by --debug-json */
export interface BirdLintDebugExtras {
  configPath?: string;
  targetFiles?: string[];
  includeMaxDepth?: number;
  includeMaxFiles?: number;
  validateCommand?: string;
}

// ── Format ──────────────────────────────────────────────────────────

export interface BirdFmtJsonOutput {
  changed: boolean;
  filePath: string;
}

/** Fields added by --debug-json */
export interface BirdFmtDebugExtras {
  elapsedMs?: number;
  engine?: string;
  indentSize?: number;
  lineWidth?: number;
}

// ── Init ────────────────────────────────────────────────────────────

export interface InitCandidateJson {
  path: string;
  score: number;
  role: string;
  signals: Array<{ name: string; delta: number }>;
}

export interface BirdInitJsonOutput {
  kind: string;
  confidence: number;
  primary: InitCandidateJson | null;
  candidates: InitCandidateJson[];
  elapsedMs?: number;
}

/** Fields added by --debug-json */
export interface BirdInitDebugExtras {
  configPath?: string;
  maxDepth?: number;
  maxFiles?: number;
  ignorePatterns?: string[];
}
