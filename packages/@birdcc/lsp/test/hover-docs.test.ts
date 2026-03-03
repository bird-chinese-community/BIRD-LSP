import { describe, expect, it } from "vitest";

import { HOVER_KEYWORDS, HOVER_KEYWORD_DOCS } from "../src/hover-docs.js";
import { KEYWORD_DOCS } from "../src/shared.js";

describe("hover docs catalog", () => {
  it("loads generated hover docs map with stable keyword coverage", () => {
    expect(HOVER_KEYWORDS.length).toBeGreaterThanOrEqual(80);
    expect(HOVER_KEYWORD_DOCS["thread group"]).toContain("Diff: `added`");
    expect(HOVER_KEYWORD_DOCS["thread group"]).toContain("Version: `v3+`");
  });

  it("exposes merged keyword docs through shared keyword map", () => {
    expect(KEYWORD_DOCS["router id"]).toContain("Version: `v2+`");
    expect(KEYWORD_DOCS["router id"]).toContain("BIRD v2.18 / v3.2.0");
    expect(KEYWORD_DOCS["router id"]).toContain("bird-2.18.html");
  });
});
