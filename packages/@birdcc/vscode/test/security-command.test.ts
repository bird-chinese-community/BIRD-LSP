import { describe, expect, it } from "vitest";

import {
  resolveServerCommand,
  resolveValidationCommandTemplate,
} from "../src/security/command.js";

describe("security command resolution", () => {
  it("accepts default server command tokens", () => {
    const result = resolveServerCommand(["birdcc", "lsp", "--stdio"]);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.command).toBe("birdcc");
    expect(result.value.args).toEqual(["lsp", "--stdio"]);
  });

  it("rejects direct shell executables", () => {
    const result = resolveServerCommand(["bash", "-c", "echo unsafe"]);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.reason).toContain("direct shell executable");
  });

  it("rejects environment expansion syntax", () => {
    const result = resolveServerCommand(["birdcc", "%PATH%", "lsp"]);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.reason).toContain("environment variable expansion");
  });
});

describe("validation template resolution", () => {
  it("requires {file} placeholder", () => {
    const result = resolveValidationCommandTemplate(
      "bird -p -c /tmp/test.conf",
      "./fixtures/test.conf",
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.reason).toContain("must include the {file} placeholder");
  });

  it("requires {file} to be a standalone token", () => {
    const result = resolveValidationCommandTemplate(
      "node -e \"console.log('prefix-{file}')\"",
      "./fixtures/test.conf",
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.reason).toContain("standalone argument token");
  });

  it("rejects environment variable expansion syntax in template", () => {
    const result = resolveValidationCommandTemplate(
      "bird -p -c %APPDATA%/{file}",
      "./fixtures/test.conf",
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.reason).toContain("environment variable expansion");
  });

  it("resolves safe template and injects normalized file path", () => {
    const result = resolveValidationCommandTemplate(
      "bird -p -c {file}",
      "./fixtures/test.conf",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.command).toBe("bird");
    expect(result.value.args).toHaveLength(3);
    expect(result.value.args[0]).toBe("-p");
    expect(result.value.args[1]).toBe("-c");
    expect(result.value.args[2]).toContain("fixtures/test.conf");
  });
});
