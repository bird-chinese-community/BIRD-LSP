import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parseBirdConfig: vi.fn(),
}));

vi.mock("@birdcc/parser", () => ({
  parseBirdConfig: mocks.parseBirdConfig,
}));

import { evaluateBirdDocumentEligibility } from "../src/detection/eligibility.js";

describe("BIRD document eligibility resilience", () => {
  beforeEach(() => {
    mocks.parseBirdConfig.mockReset();
  });

  it("rejects an ordinary document when the parser fails", async () => {
    mocks.parseBirdConfig.mockRejectedValueOnce(new Error("parser failed"));

    await expect(
      evaluateBirdDocumentEligibility("protocol device {}", {
        filePath: "custom.conf",
      }),
    ).resolves.toEqual({
      eligible: false,
      reason: "no-evidence",
      declarationKinds: [],
    });
  });

  it.each([
    ["canonical", { filePath: "bird.conf" }, "canonical-filename"],
    [
      "explicit main",
      { filePath: "custom.conf", explicitMain: true },
      "explicit-main",
    ],
  ])(
    "uses the %s escape hatch without invoking the parser",
    async (_name, options, reason) => {
      mocks.parseBirdConfig.mockRejectedValueOnce(new Error("parser failed"));

      await expect(
        evaluateBirdDocumentEligibility("", options),
      ).resolves.toEqual({
        eligible: true,
        reason,
        declarationKinds: [],
      });
      expect(mocks.parseBirdConfig).not.toHaveBeenCalled();
    },
  );
});
