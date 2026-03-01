import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { formatBirdConfigText, parseBirdStderr, runBirdValidation, runLint } from "../src/index.js";

describe("@birdcc/cli bird parser", () => {
  it("parses bird colon format diagnostics", () => {
    const input = "/etc/bird.conf:12:9 syntax error, unexpected CF_SYM_UNDEFINED";
    const diagnostics = parseBirdStderr(input);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].range.line).toBe(12);
    expect(diagnostics[0].range.column).toBe(9);
  });

  it("parses Parse error format diagnostics", () => {
    const input = "Parse error /etc/bird.conf, line 15: unknown symbol local_as";
    const diagnostics = parseBirdStderr(input);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].range.line).toBe(15);
    expect(diagnostics[0].range.column).toBe(1);
  });

  it("formats text by removing trailing spaces and duplicated blank lines", async () => {
    const input = "router id 192.0.2.1;   \n\n\nprotocol bgp test {}\t\n";
    const result = await formatBirdConfigText(input);

    expect(result.changed).toBe(true);
    expect(result.formattedText).toBe("router id 192.0.2.1;\n\nprotocol bgp test {}\n");
  });

  it("applies lint severity overrides from options at output layer", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "birdcc-cli-severity-override-"));
    const entryFile = join(workspaceDir, "main.conf");

    await writeFile(entryFile, "router id 192.0.2.1;\n", "utf8");

    const result = await runLint(entryFile, {
      severityOverrides: {
        "cfg/no-protocol": "warning",
      },
    });

    const diagnostic = result.diagnostics.find((item) => item.code === "cfg/no-protocol");
    expect(diagnostic?.severity).toBe("warning");
  });

  it("uses BIRD_BIN environment variable when validate command is omitted", async () => {
    const previousBirdBin = process.env.BIRD_BIN;
    process.env.BIRD_BIN = "/definitely-not-existing-bird-binary";

    try {
      const result = runBirdValidation("/tmp/bird.conf");
      expect(result.command).toBe("/definitely-not-existing-bird-binary -p -c /tmp/bird.conf");
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].code).toBe("bird/runner-error");
    } finally {
      if (previousBirdBin) {
        process.env.BIRD_BIN = previousBirdBin;
      } else {
        delete process.env.BIRD_BIN;
      }
    }
  });

  it("rejects unsafe file path control characters in bird validation command args", () => {
    const result = runBirdValidation("/tmp/bird.conf\nmalicious");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe("bird/runner-error");
    expect(result.diagnostics[0].message).toContain("unsafe file path");
  });

  it("rejects unsafe file path metacharacters in bird validation command args", () => {
    const result = runBirdValidation("/tmp/bird.conf;touch-pwned");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe("bird/runner-error");
    expect(result.diagnostics[0].message).toContain("unsafe file path");
  });

  it("enables cross-file lint by default and resolves include symbols", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "birdcc-cli-cross-file-"));
    const entryFile = join(workspaceDir, "main.conf");
    const includeFile = join(workspaceDir, "filters.conf");

    await writeFile(includeFile, "filter shared_in { accept; }\n", "utf8");
    await writeFile(
      entryFile,
      [
        'include "filters.conf";',
        "protocol bgp edge {",
        "  local as 65000;",
        "  neighbor 192.0.2.1 as 65001;",
        "  import filter shared_in;",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    const singleFile = await runLint(entryFile, { crossFile: false });
    expect(singleFile.diagnostics.some((item) => item.code === "sym/filter-required")).toBe(true);

    const crossFile = await runLint(entryFile);
    expect(crossFile.diagnostics.some((item) => item.code === "sym/filter-required")).toBe(false);
  });

  it("reports include depth limit warnings without aborting lint", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "birdcc-cli-include-depth-"));
    const entryFile = join(workspaceDir, "main.conf");
    const includeA = join(workspaceDir, "a.conf");
    const includeB = join(workspaceDir, "b.conf");

    await writeFile(entryFile, 'include "a.conf";\n', "utf8");
    await writeFile(includeA, 'include "b.conf";\n', "utf8");
    await writeFile(includeB, "filter never_reached { reject; }\n", "utf8");

    const result = await runLint(entryFile, { includeMaxDepth: 1 });
    expect(result.diagnostics.some((item) => item.message.includes("max depth"))).toBe(true);
  });

  it("keeps cross-file diagnostics and bird diagnostics when both are enabled", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "birdcc-cli-bird-cross-file-"));
    const entryFile = join(workspaceDir, "main.conf");
    const includeFile = join(workspaceDir, "filters.conf");

    await writeFile(includeFile, "filter shared_in { accept; }\n", "utf8");
    await writeFile(
      entryFile,
      ['include "filters.conf";', "protocol bgp edge { import filter shared_in; }", ""].join("\n"),
      "utf8",
    );

    const result = await runLint(entryFile, {
      withBird: true,
      validateCommand: "/definitely-not-existing-bird-binary -p -c {file}",
    });

    expect(result.diagnostics.some((item) => item.code === "bird/runner-error")).toBe(true);
    expect(result.diagnostics.some((item) => item.code === "sym/filter-required")).toBe(false);
  });
});
