/**
 * Types for project entry-point detection (Smart Init Sniffing).
 *
 * Shared by CLI (`birdcc init`) and LSP workspace initialization.
 */

export type FileRole =
  | "entry"
  | "library"
  | "fragment"
  | "external"
  | "unknown";

export type DetectionKind =
  | "single" // 单实例，高置信度自动选定
  | "single-ambiguous" // 单实例，低置信度，需用户确认
  | "monorepo-multi-entry" // 多个独立实例 (dc1/dc2/dc3)
  | "monorepo-multi-role" // 共享主配置 + 多套 vars
  | "not-found";

export interface DetectionResult {
  kind: DetectionKind;
  confidence: number; // 0–100
  primary: EntryCandidate | null;
  candidates: EntryCandidate[];
  warnings: DetectionWarning[];
}

export interface EntryCandidate {
  /** Relative path from project root */
  path: string;
  score: number;
  signals: SignalRecord[];
  role: FileRole;
  visitedCount: number;
  missingIncludes: number;
  /** Whether the file contains parsed BIRD declarations or is explicitly trusted. */
  qualified?: boolean;
  /** Parsed declaration kinds used as positive BIRD language evidence. */
  declarationKinds?: BirdDeclarationEvidence[];
  /** Number of other scanned files that include this candidate. */
  includedByCount?: number;
}

export interface SignalRecord {
  name: string;
  delta: number;
}

export interface DetectionWarning {
  code: string;
  message: string;
  path?: string;
}

export interface DetectionOptions {
  maxDepth?: number; // default: 8
  maxCandidates?: number; // default: 100
  maxFiles?: number; // default: 20000
  exclude?: string[]; // additional glob patterns
  forceRescan?: boolean;
  followSymlinks?: boolean; // default: false
  /** Explicitly configured main file, relative to the detection root. */
  explicitMain?: string;
}

export type BirdDeclarationEvidence =
  | "router-id"
  | "include"
  | "define"
  | "graceful-restart-wait"
  | "hostname-override"
  | "attribute"
  | "table"
  | "mpls-domain"
  | "filter"
  | "function"
  | "template"
  | "protocol"
  | "timeformat"
  | "watchdog";

export type BirdDocumentEligibilityReason =
  | "canonical-filename"
  | "explicit-main"
  | "semantic-evidence"
  | "no-evidence";

export interface BirdDocumentEligibility {
  eligible: boolean;
  reason: BirdDocumentEligibilityReason;
  declarationKinds: BirdDeclarationEvidence[];
}

export interface BirdDocumentEligibilityOptions {
  filePath?: string;
  explicitMain?: boolean;
}

/** Signals extracted from lightweight content scanning (v0.2) */
export interface ContentSignals {
  hasGlobalRouterId: boolean;
  hasProtocolRouterIdOnly: boolean;
  hasProtocolDevice: boolean;
  hasProtocolKernel: boolean;
  hasLogDirective: boolean;
  hasProtocolBlock: boolean;
  hasDefine: boolean;
  includeStatements: string[];
  commentedIncludes: string[];
}

/** Include-graph analysis extras (v0.3) */
export interface IncludeGraphExtras {
  externalIncludes: Map<string, string[]>;
  commentedIncludes: Map<string, string[]>;
  cycleWarnings: Array<[string, string]>;
}
