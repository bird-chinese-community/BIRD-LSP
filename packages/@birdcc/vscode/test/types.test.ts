import { describe, expect, it } from "vitest";

import {
  defaultExtensionConfiguration,
  parseExtensionConfiguration,
} from "../src/types.js";

describe("extension configuration parsing", () => {
  it("parses a valid configuration object", () => {
    const parsed = parseExtensionConfiguration({
      ...defaultExtensionConfiguration,
      enabled: false,
      validationTimeoutMs: 45_000,
      performanceMaxFileSizeBytes: 4 * 1024 * 1024,
      lspStartupTimeoutMs: 15_000,
      formatterEngine: "builtin",
    });

    expect(parsed.enabled).toBe(false);
    expect(parsed.validationTimeoutMs).toBe(45_000);
    expect(parsed.performanceMaxFileSizeBytes).toBe(4 * 1024 * 1024);
    expect(parsed.lspStartupTimeoutMs).toBe(15_000);
    expect(parsed.formatterEngine).toBe("builtin");
  });

  it("falls back to default for invalid configuration payload", () => {
    const parsed = parseExtensionConfiguration({
      ...defaultExtensionConfiguration,
      performanceMaxFileSizeBytes: 32,
      lspStartupTimeoutMs: 100,
    });

    expect(parsed).toEqual(defaultExtensionConfiguration);
  });

  it("preserves other valid settings and reports the invalid field", () => {
    const issues: string[] = [];
    const parsed = parseExtensionConfiguration(
      {
        ...defaultExtensionConfiguration,
        enabled: false,
        validationEnabled: false,
        formatterEngine: "builtin",
        validationTimeoutMs: -1,
      },
      (message) => issues.push(message),
    );
    expect(parsed.enabled).toBe(false);
    expect(parsed.validationEnabled).toBe(false);
    expect(parsed.formatterEngine).toBe("builtin");
    expect(parsed.validationTimeoutMs).toBe(
      defaultExtensionConfiguration.validationTimeoutMs,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("validationTimeoutMs");
  });
});
