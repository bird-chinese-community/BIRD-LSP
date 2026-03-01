import { describe, expect, it } from "vitest";
import { formatBirdConfigText, parseBirdStderr, runBirdValidation } from "../src/index.js";

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

  it("formats text by removing trailing spaces and duplicated blank lines", () => {
    const input = "router id 192.0.2.1;   \n\n\nprotocol bgp test {}\t\n";
    const result = formatBirdConfigText(input);

    expect(result.changed).toBe(true);
    expect(result.formattedText).toBe("router id 192.0.2.1;\n\nprotocol bgp test {}\n");
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
});
