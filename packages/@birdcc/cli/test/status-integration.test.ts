import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runBirdValidation, runLint } from "../src/index.js";

const packageDir = fileURLToPath(new URL("..", import.meta.url));
const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const validator = (script: string): string =>
  `"${process.execPath}" -e '${script}' {file}`;
const processTimeoutMs = 10_000;
const processTestTimeoutMs = 30_000;

describe("CLI process status and runtime exports", () => {
  let directory: string;
  let file: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "birdcc-status-"));
    file = join(directory, "bird.conf");
    await writeFile(file, "router id 192.0.2.1;  \nprotocol device {}\n");
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it.each([{ output: [] }, { output: ["--json"] }])(
    "fails a changed formatting check with $output",
    ({ output }) => {
      const result = spawnSync(
        process.execPath,
        [cliPath, "fmt", file, "--check", "--engine", "builtin", ...output],
        { encoding: "utf8", timeout: processTimeoutMs },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      if (output.length > 0) {
        expect(JSON.parse(result.stdout)).toMatchObject({
          changed: true,
          filePath: file,
        });
      }
    },
    processTestTimeoutMs,
  );

  it(
    "writes JSON output successfully and passes a subsequent check",
    async () => {
      const written = spawnSync(
        process.execPath,
        [cliPath, "fmt", file, "--write", "--json", "--engine", "builtin"],
        { encoding: "utf8", timeout: processTimeoutMs },
      );
      expect(written.error).toBeUndefined();
      expect(written.status).toBe(0);
      expect(JSON.parse(written.stdout)).toMatchObject({ changed: true });
      expect(await readFile(file, "utf8")).toBe(
        "router id 192.0.2.1;\nprotocol device {}\n",
      );
      const checked = spawnSync(
        process.execPath,
        [cliPath, "fmt", file, "--check", "--json", "--engine", "builtin"],
        { encoding: "utf8", timeout: processTimeoutMs },
      );
      expect(checked.error).toBeUndefined();
      expect(checked.status).toBe(0);
      expect(JSON.parse(checked.stdout)).toMatchObject({ changed: false });
    },
    processTestTimeoutMs,
  );

  it("reports a silent nonzero validator exit and retains its status", async () => {
    const command = validator("process.exit(2)");
    const validated = runBirdValidation(file, command);
    expect(validated.exitCode).toBe(2);
    expect(validated.diagnostics).toMatchObject([
      { code: "bird/runner-error", severity: "error" },
    ]);
    const linted = await runLint(file, {
      linterEnabled: false,
      withBird: true,
      validateCommand: command,
    });
    expect(linted.diagnostics).toEqual(validated.diagnostics);
  });

  it("reports a validator terminated by a signal", () => {
    const result = runBirdValidation(
      file,
      validator('process.kill(process.pid, "SIGTERM")'),
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.diagnostics[0]?.message).toContain("SIGTERM");
  });

  it("preserves stderr diagnostics without adding a runner error", () => {
    const result = runBirdValidation(
      file,
      validator('console.error("validation failed"); process.exit(2)'),
    );
    expect(result.diagnostics).toMatchObject([
      { code: "bird/parse-error", message: "validation failed" },
    ]);
  });

  it("runs only external validation when the internal linter is disabled", async () => {
    await writeFile(file, "router id 192.0.2.1;\n");
    const result = await runLint(file, {
      linterEnabled: false,
      withBird: true,
      validateCommand: validator("process.exit(0)"),
    });
    expect(result.diagnostics).toEqual([]);
  });

  it.each([true, false])(
    "keeps external validation independent of internal budgets with crossFile=%s",
    async (crossFile) => {
      const result = await runLint(file, {
        linterEnabled: false,
        withBird: true,
        crossFile,
        includeMaxDocumentBytes: 1,
        includeMaxTotalBytes: 1,
        validateCommand: validator("process.exit(2)"),
      });
      expect(result.diagnostics).toMatchObject([
        {
          code: "bird/runner-error",
          severity: "error",
          message: expect.stringContaining("status 2"),
        },
      ]);
    },
  );

  it("applies the document budget to internal single-file lint", async () => {
    await expect(
      runLint(file, {
        crossFile: false,
        includeMaxDocumentBytes: 1,
        includeMaxTotalBytes: 1,
      }),
    ).rejects.toThrow(/size limit/u);
  });

  it("imports and uses the schema subpath through Node package exports", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        'import { BirdFmtJsonOutputSchema } from "@birdcc/cli/output-schemas"; console.log(BirdFmtJsonOutputSchema.parse({ changed: true, filePath: "bird.conf" }).changed);',
      ],
      { cwd: packageDir, encoding: "utf8" },
    );
    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("true");
  });
});
