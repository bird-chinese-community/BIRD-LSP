import { describe, expect, it } from "vitest";
import { checkBirdConfigFormat, formatBirdConfig } from "../src/index.js";

describe("@birdcc/formatter", () => {
  it("formats text with builtin fallback", () => {
    const input = "router id 192.0.2.1;   \n\n\nprotocol bgp edge {}\t\n";
    const result = formatBirdConfig(input, { engine: "builtin" });

    expect(result.changed).toBe(true);
    expect(result.engine).toBe("builtin");
    expect(result.text).toBe("router id 192.0.2.1;\n\nprotocol bgp edge {}\n");
  });

  it("is idempotent after formatting", () => {
    const input = "router id 192.0.2.1;   \n\n\nprotocol bgp edge {}\t\n";
    const first = formatBirdConfig(input, { engine: "builtin" });
    const second = formatBirdConfig(first.text, { engine: "builtin" });

    expect(second.changed).toBe(false);
    expect(second.text).toBe(first.text);
  });

  it("check result is consistent with format result", () => {
    const input = "protocol bgp edge {}\n";
    const check = checkBirdConfigFormat(input, { engine: "builtin" });
    const formatted = formatBirdConfig(input, { engine: "builtin" });

    expect(check.changed).toBe(formatted.changed);
  });
});
