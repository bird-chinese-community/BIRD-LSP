/**
 * Zod schemas for birdcc CLI JSON output.
 *
 * These can also be used to generate JSON Schema via `zod-to-json-schema`:
 *
 *   import { zodToJsonSchema } from "zod-to-json-schema";
 *   const jsonSchema = zodToJsonSchema(BirdLintJsonOutputSchema);
 */

import { z } from "zod";

// ── Shared ──────────────────────────────────────────────────────────

const SpanLabelSchema = z.object({
  offset: z.number().int().nonnegative(),
  length: z.number().int().nonnegative(),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
});

const FileRangeSchema = z.object({
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  endLine: z.number().int().positive(),
  endColumn: z.number().int().positive(),
});

// ── Lint ────────────────────────────────────────────────────────────

const BirdLintDiagnosticShape = {
  code: z.string(),
  message: z.string(),
  severity: z.enum(["error", "warning", "info"]),
  source: z.enum(["parser", "core", "linter", "bird"]),
  range: FileRangeSchema,
  uri: z.string().optional(),
  url: z.string().optional(),
  help: z.string().optional(),
  labels: z.array(SpanLabelSchema),
} as const;

export const BirdLintDiagnosticSchema = z.object(BirdLintDiagnosticShape);

// Recursive reference for causes/related — use lazy + explicit type
type BirdDiagZod = z.ZodObject<typeof BirdLintDiagnosticShape>;

const recursiveDiag: z.ZodType<z.infer<BirdDiagZod>> = z.lazy(
  () => BirdLintDiagnosticSchema,
);

export const BirdLintDiagnosticWithExtrasSchema =
  BirdLintDiagnosticSchema.extend({
    causes: z.array(recursiveDiag),
    related: z.array(recursiveDiag),
  });

export const BirdLintJsonOutputSchema = z.object({
  diagnostics: z.array(BirdLintDiagnosticSchema),
  files: z.number().int().nonnegative(),
  rules: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  elapsedMs: z.number().nonnegative(),
});

// ── Format ──────────────────────────────────────────────────────────

export const BirdFmtJsonOutputSchema = z.object({
  changed: z.boolean(),
  filePath: z.string(),
});

// ── Init ────────────────────────────────────────────────────────────

export const InitCandidateJsonSchema = z.object({
  path: z.string(),
  score: z.number().int(),
  role: z.string(),
  signals: z.array(
    z.object({
      name: z.string(),
      delta: z.number().int(),
    }),
  ),
});

export const BirdInitJsonOutputSchema = z.object({
  kind: z.string(),
  confidence: z.number().int().min(0).max(100),
  primary: InitCandidateJsonSchema.nullable(),
  candidates: z.array(InitCandidateJsonSchema),
  elapsedMs: z.number().nonnegative().optional(),
});
