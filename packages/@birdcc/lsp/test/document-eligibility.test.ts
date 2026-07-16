import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateLspDocumentEligibility } from "../src/document-eligibility.js";
import type { ProjectAnalysisOptions } from "../src/project-config.js";

const createProject = (
  entryUri: string,
  overrides: Partial<ProjectAnalysisOptions> = {},
): ProjectAnalysisOptions => ({
  entryUri,
  includeSearchPathUris: [],
  maxDepth: 16,
  maxFiles: 256,
  allowIncludeOutsideWorkspace: false,
  crossFileEnabled: true,
  mode: "document",
  ...overrides,
});

describe("LSP document eligibility", () => {
  it("rejects foreign documents in an unconfigured workspace", async () => {
    const uri = pathToFileURL("/workspace/nginx.conf").toString();

    await expect(
      evaluateLspDocumentEligibility(
        "events {}\nhttp { server { listen 80; } }",
        uri,
        createProject(uri),
      ),
    ).resolves.toMatchObject({ eligible: false, reason: "no-evidence" });
  });

  it("accepts canonical, explicit-main, and semantic BIRD documents", async () => {
    const canonicalUri = pathToFileURL("/workspace/bird.conf").toString();
    const explicitUri = pathToFileURL("/workspace/custom.conf").toString();

    await expect(
      evaluateLspDocumentEligibility(
        "",
        canonicalUri,
        createProject(canonicalUri),
      ),
    ).resolves.toMatchObject({ eligible: true, reason: "canonical-filename" });
    await expect(
      evaluateLspDocumentEligibility(
        "",
        explicitUri,
        createProject(explicitUri, {
          mode: "main",
          configPath: "/workspace/bird.config.json",
        }),
      ),
    ).resolves.toMatchObject({ eligible: true, reason: "explicit-main" });
    await expect(
      evaluateLspDocumentEligibility(
        "protocol device {}",
        explicitUri,
        createProject(explicitUri),
      ),
    ).resolves.toMatchObject({ eligible: true, reason: "semantic-evidence" });
  });
});
