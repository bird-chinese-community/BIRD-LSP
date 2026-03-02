import { describe, expect, it } from "vitest";

import { shouldRunLifecycleForConfigurationChange } from "../src/config/reload-policy.js";

const buildChange = (
  changedPaths: readonly string[],
): { readonly changedPaths: readonly string[] } => ({ changedPaths });

describe("reload configuration lifecycle trigger", () => {
  it("does not trigger lifecycle when nothing changed", () => {
    const change = buildChange([]);
    expect(shouldRunLifecycleForConfigurationChange(change)).toBe(false);
  });

  it("triggers lifecycle when there are changed paths", () => {
    const change = buildChange(["enabled"]);
    expect(shouldRunLifecycleForConfigurationChange(change)).toBe(true);
  });
});
