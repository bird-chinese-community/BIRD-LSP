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
      formatterEngine: "builtin",
    });

    expect(parsed.enabled).toBe(false);
    expect(parsed.validationTimeoutMs).toBe(45_000);
    expect(parsed.performanceMaxFileSizeBytes).toBe(4 * 1024 * 1024);
    expect(parsed.formatterEngine).toBe("builtin");
  });

  it("falls back to default for invalid configuration payload", () => {
    const parsed = parseExtensionConfiguration({
      ...defaultExtensionConfiguration,
      performanceMaxFileSizeBytes: 32,
    });

    expect(parsed).toEqual(defaultExtensionConfiguration);
  });
});
