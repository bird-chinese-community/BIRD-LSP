import { describe, expect, it } from "vitest";

import {
  validateChangelogEntry,
  validateMarketplaceManifest,
} from "../../../../tools/vscode-release-info.mjs";

const releaseEntry = {
  changelogPath: "packages/@birdcc/vscode/CHANGELOG.md",
  version: "0.5.2",
  releaseTag: "bird2-lsp-v0.5.2",
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

  it("rejects a version heading without its link reference", () => {
    expect(() =>
      validateChangelogEntry({
        ...releaseEntry,
        changelog: "## [0.5.2] - 2026-07-19\n",
      }),
    ).toThrow("must define the release link");
  });

  it("rejects a link reference pointing at a different tag", () => {
    expect(() =>
      validateChangelogEntry({
        ...releaseEntry,
        changelog: `## [0.5.2] - 2026-07-19

[0.5.2]: https://github.com/bird-chinese-community/BIRD-LSP/releases/tag/v0.5.2
`,
      }),
    ).toThrow("bird2-lsp-v0.5.2");
  });

  it("accepts the exact versioned release link", () => {
    expect(() =>
      validateChangelogEntry({
        ...releaseEntry,
        changelog: `## [0.5.2] - 2026-07-19

[0.5.2]: https://github.com/bird-chinese-community/BIRD-LSP/releases/tag/bird2-lsp-v0.5.2
`,
      }),
    ).not.toThrow();
  });
});
