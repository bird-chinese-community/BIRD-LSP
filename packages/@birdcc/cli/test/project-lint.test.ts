import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

interface LintOutput {
  diagnostics: Array<{ code: string; severity: string }>;
}

it.each([false, true])(
  "accepts reserved extends and applies project rules (crossFile=%s)",
  async (crossFileEnabled) => {
    const root = await mkdtemp(join(tmpdir(), "birdcc-cli-project-lint-"));
    try {
      const file = join(root, "bird.conf");
      await writeFile(
        file,
        "router id 999.0.2.1;\nprotocol bgp edge {\n neighbor 192.0.2.2 as 174;\n}\n",
      );
      const lint = async (rules: Record<string, string>) => {
        await writeFile(
          join(root, "bird.config.json"),
          JSON.stringify({
            main: "bird.conf",
            crossFile: { enabled: crossFileEnabled },
            linter: { extends: ["bird-recommended"], rules },
          }),
        );
        const output: LintOutput = JSON.parse(
          execFileSync(
            process.execPath,
            [
              fileURLToPath(new URL("../dist/cli.js", import.meta.url)),
              "lint",
              file,
              "--format",
              "json",
            ],
            { cwd: root, timeout: 10_000, encoding: "utf8" },
          ),
        );
        return output;
      };
      const enabled = await lint({ "cfg/*": "info", "bgp/*": "info" });
      expect(enabled.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "cfg/incompatible-type",
            severity: "info",
          }),
          expect.objectContaining({
            code: "bgp/missing-local-as",
            severity: "info",
          }),
        ]),
      );
      const disabled = await lint({ "cfg/*": "info", "bgp/*": "off" });
      expect(disabled.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "cfg/incompatible-type",
          severity: "info",
        }),
      );
      expect(
        disabled.diagnostics.some((item) => item.code.startsWith("bgp/")),
      ).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  30_000,
);
