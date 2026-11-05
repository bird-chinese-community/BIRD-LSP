import { describe, expect, it } from "vitest";

import {
  validateChangelogEntry,
  validateMarketplaceManifest,
} from "../../../../tools/vscode-release-info.mjs";

const releaseEntry = {
  changelogPath: "packages/@birdcc/vscode/CHANGELOG.md",
  version: "1.0.0",
  packageName: "@birdcc/vscode",
};

describe("VS Code release metadata", () => {
  it("rejects Marketplace packages that npm can publish", () => {
    expect(() =>
      validateMarketplaceManifest(
        {
          version: "0.1.2",
          publisher: "BIRDCC",
          private: false,
        },
        "bird2-extension-pack",
      ),
    ).toThrow("must remain private");
  });

  it("rejects a changelog for a different version", () => {
    expect(() =>
      validateChangelogEntry({
        ...releaseEntry,
        changelog: "## @birdcc/vscode@0.5.3\n",
      }),
    ).toThrow("has no entry for 1.0.0");
  });

  it("rejects a changelog for another release unit", () => {
    expect(() =>
      validateChangelogEntry({
        ...releaseEntry,
        changelog: "## bird2-extension-pack@1.0.0\n",
      }),
    ).toThrow("has no entry for 1.0.0");
  });

  it("accepts the native Tegami version heading", () => {
    expect(() =>
      validateChangelogEntry({
        ...releaseEntry,
        changelog: "## @birdcc/vscode@1.0.0\n\n### Editor updates\n",
      }),
    ).not.toThrow();
  });
});
