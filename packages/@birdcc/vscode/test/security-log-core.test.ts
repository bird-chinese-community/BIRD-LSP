import { describe, expect, it } from "vitest";

import { sanitizeLogMessageWithContext } from "../src/security/log-core.js";

describe("security log core sanitization", () => {
  it("replaces workspace and home paths with safe aliases", () => {
    const message =
      "error at /Users/nana/work/bird/project/bgp.conf and /Users/nana/.ssh/id_rsa";

    const sanitized = sanitizeLogMessageWithContext(message, {
      workspaceRoots: ["/Users/nana/work/bird/project", "/Users/nana/work"],
      homePath: "/Users/nana",
    });

    expect(sanitized).toContain("<workspace>/bgp.conf");
    expect(sanitized).toContain("~/.ssh/id_rsa");
    expect(sanitized).not.toContain("/Users/nana/work/bird/project");
  });

  it("handles mixed slash styles for path replacement", () => {
    const message =
      "/repo/project/a.conf \\repo\\project\\b.conf /home/alice/notes.txt";

    const sanitized = sanitizeLogMessageWithContext(message, {
      workspaceRoots: ["/repo/project"],
      homePath: "/home/alice",
    });

    expect(sanitized).toContain("<workspace>");
    expect(sanitized).toContain("~/notes.txt");
    expect(sanitized).not.toContain("/repo/project");
    expect(sanitized).not.toContain("\\repo\\project");
    expect(sanitized).not.toContain("/home/alice");
  });
});
