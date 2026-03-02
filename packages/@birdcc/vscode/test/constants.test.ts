import { describe, expect, it } from "vitest";

import { RESTART_REQUIRED_CONFIGURATION_PATHS } from "../src/constants.js";

describe("restart-required configuration paths", () => {
  it("includes traceServer runtime key", () => {
    expect(RESTART_REQUIRED_CONFIGURATION_PATHS).toContain("traceServer");
  });

  it("does not include raw config key path trace.server", () => {
    expect(RESTART_REQUIRED_CONFIGURATION_PATHS).not.toContain("trace.server");
  });
});
