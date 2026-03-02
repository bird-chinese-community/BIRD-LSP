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
      caseInsensitivePathMatch: false,
    });

    expect(sanitized).toContain("<workspace>/a.conf");
    expect(sanitized).toContain("<workspace>\\b.conf");
    expect(sanitized).toContain("~/notes.txt");
    expect(sanitized).not.toContain("/repo/project");
    expect(sanitized).not.toContain("\\repo\\project");
    expect(sanitized).not.toContain("/home/alice");
  });

  it("supports case-insensitive path sanitization for case-insensitive file systems", () => {
    const message =
      "trace /USERS/NANA/WORK/BIRD/PROJECT/BGP.CONF and /users/nana/.ssh/id_ed25519";

    const sanitized = sanitizeLogMessageWithContext(message, {
      workspaceRoots: ["/Users/nana/work/bird/project"],
      homePath: "/Users/nana",
      caseInsensitivePathMatch: true,
    });

    expect(sanitized).toContain("<workspace>/BGP.CONF");
    expect(sanitized).toContain("~/.ssh/id_ed25519");
    expect(sanitized).not.toContain("/USERS/NANA/WORK/BIRD/PROJECT");
    expect(sanitized).not.toContain("/users/nana");
  });
});
