import type { BirdDiagnosticSeverity } from "@birdcc/core";

export const RULE_CODES = {
  sym: [
    "sym/undefined",
    "sym/duplicate",
    "sym/proto-type-mismatch",
    "sym/filter-required",
    "sym/function-required",
    "sym/table-required",
    "sym/variable-scope",
  ],
  cfg: [
    "cfg/no-protocol",
    "cfg/missing-router-id",
    "cfg/syntax-error",
    "cfg/value-out-of-range",
    "cfg/switch-value-expected",
    "cfg/number-expected",
    "cfg/incompatible-type",
    "cfg/ip-network-mismatch",
    "cfg/circular-template",
  ],
  net: [
    "net/invalid-prefix-length",
    "net/invalid-ipv4-prefix",
    "net/invalid-ipv6-prefix",
    "net/max-prefix-length",
  ],
  type: ["type/mismatch", "type/not-iterable", "type/set-incompatible"],
  bgp: [
    "bgp/missing-local-as",
    "bgp/missing-neighbor",
    "bgp/missing-remote-as",
    "bgp/as-mismatch",
    "bgp/timer-invalid",
  ],
  ospf: [
    "ospf/missing-area",
    "ospf/backbone-stub",
    "ospf/vlink-in-backbone",
    "ospf/asbr-stub-area",
  ],
} as const;

export type RuleCode =
  | (typeof RULE_CODES.sym)[number]
  | (typeof RULE_CODES.cfg)[number]
  | (typeof RULE_CODES.net)[number]
  | (typeof RULE_CODES.type)[number]
  | (typeof RULE_CODES.bgp)[number]
  | (typeof RULE_CODES.ospf)[number];

const ruleSeverityEntries: ReadonlyArray<
  readonly [RuleCode, BirdDiagnosticSeverity]
> = [
  ...RULE_CODES.sym.map((code) => [code, "error"] as const),
  ...RULE_CODES.cfg.map((code) => [code, "error"] as const),
  ...RULE_CODES.net.map((code) => [code, "error"] as const),
  ...RULE_CODES.type.map((code) => [code, "error"] as const),
  ...RULE_CODES.bgp.map((code) => [code, "warning"] as const),
  ...RULE_CODES.ospf.map((code) => [code, "warning"] as const),
];

export const RULE_SEVERITY: Record<RuleCode, BirdDiagnosticSeverity> =
  Object.fromEntries(ruleSeverityEntries) as Record<
    RuleCode,
    BirdDiagnosticSeverity
  >;

export const LEGACY_CODE_PATTERNS = [
  /^protocol\//,
  /^security\//,
  /^performance\//,
  /^structure\//,
] as const;

export const isRuleCode = (code: string): code is RuleCode => {
  return code in RULE_SEVERITY;
};
