export type FormatterEngine = "dprint" | "builtin";

export interface FormatBirdConfigOptions {
  engine?: FormatterEngine;
  indentSize?: number;
  lineWidth?: number;
  safeMode?: boolean;
}

export interface ResolvedFormatOptions {
  engine: FormatterEngine;
  indentSize: number;
  lineWidth: number;
  safeMode: boolean;
}

export interface BirdFormatResult {
  text: string;
  changed: boolean;
  engine: FormatterEngine;
}

export interface BirdFormatCheckResult {
  changed: boolean;
}

export interface BuiltinFormatStats {
  linesTotal: number;
  linesTouched: number;
  blankLinesCollapsed: number;
  indentationAdjustments: number;
  highRiskLines: number;
  parserProtectedLines: number;
}

export interface BuiltinFormatOutput {
  text: string;
  stats: BuiltinFormatStats;
}
