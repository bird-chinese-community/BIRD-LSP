import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { HOVER_KEYWORDS, HOVER_KEYWORD_DOCS } from "../src/hover-docs.js";
import { KEYWORD_DOCS } from "../src/shared.js";

describe("hover docs catalog", () => {
  it("keeps split hover yaml fragments valid and loadable", () => {
    const packageRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    const hoverDocsDir = path.join(packageRoot, "data", "hover-docs");
    const yamlFiles = readdirSync(hoverDocsDir)
      .filter((fileName) => fileName.endsWith(".yaml"))
      .sort((left, right) => left.localeCompare(right));

    expect(yamlFiles.length).toBeGreaterThanOrEqual(3);

    const allEntries: unknown[] = [];
    let v2BaseUrl = "";
    let v3BaseUrl = "";
    for (const fileName of yamlFiles) {
      const fileContent = readFileSync(
        path.join(hoverDocsDir, fileName),
        "utf8",
      );
      const parsed = parse(fileContent) as {
        readonly baseUrls?: { readonly v2?: string; readonly v3?: string };
        readonly entries?: readonly unknown[];
      };
      expect(parsed).toBeTruthy();
      if (parsed.baseUrls?.v2) {
        v2BaseUrl = parsed.baseUrls.v2;
      }
      if (parsed.baseUrls?.v3) {
        v3BaseUrl = parsed.baseUrls.v3;
      }
      if (Array.isArray(parsed.entries)) {
        allEntries.push(...parsed.entries);
      }
    }

    expect(v2BaseUrl).toMatch(/^https:\/\/bird\.nic\.cz\/doc\//);
    expect(v3BaseUrl).toMatch(/^https:\/\/bird\.nic\.cz\/doc\//);
    expect(allEntries.length).toBeGreaterThanOrEqual(80);
  });

  it("keeps usage yaml fragments valid and loadable", () => {
    const packageRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    const hoverUsageDir = path.join(packageRoot, "data", "hover-usage");
    const yamlFiles = readdirSync(hoverUsageDir)
      .filter((fileName) => fileName.endsWith(".yaml"))
      .sort((left, right) => left.localeCompare(right));

    expect(yamlFiles.length).toBeGreaterThanOrEqual(4);

    const usageEntries: Array<{ keyword?: string; usage?: string }> = [];
    for (const fileName of yamlFiles) {
      const fileContent = readFileSync(
        path.join(hoverUsageDir, fileName),
        "utf8",
      );
      const parsed = parse(fileContent) as {
        readonly entries?: readonly { keyword?: string; usage?: string }[];
      };
      expect(parsed).toBeTruthy();
      if (Array.isArray(parsed.entries)) {
        usageEntries.push(...parsed.entries);
      }
    }

    expect(usageEntries.length).toBeGreaterThanOrEqual(30);
    expect(
      usageEntries.some(
        (entry) =>
          entry.keyword === "router id" &&
          typeof entry.usage === "string" &&
          entry.usage.includes("10.0.0.1"),
      ),
    ).toBe(true);
    expect(
      usageEntries.some(
        (entry) =>
          entry.keyword === "neighbor" &&
          typeof entry.usage === "string" &&
          entry.usage.includes("as 64496"),
      ),
    ).toBe(true);
  });

  it("loads generated hover docs map with stable keyword coverage", () => {
    expect(HOVER_KEYWORDS.length).toBeGreaterThanOrEqual(80);
    expect(HOVER_KEYWORD_DOCS["thread group"]).toContain("Diff: `added`");
    expect(HOVER_KEYWORD_DOCS["thread group"]).toContain("Version: `v3+`");
    expect(HOVER_KEYWORD_DOCS["router id"]).toContain("Usage:");
    expect(HOVER_KEYWORD_DOCS["neighbor"]).toContain(
      "neighbor 192.0.2.1 as 64496;",
    );
  });

  it("exposes merged keyword docs through shared keyword map", () => {
    expect(KEYWORD_DOCS["router id"]).toContain("Version: `v2+`");
    expect(KEYWORD_DOCS["router id"]).toContain("BIRD v2.18 / v3.2.0");
    expect(KEYWORD_DOCS["router id"]).toContain("bird-2.18.html");
  });
});
