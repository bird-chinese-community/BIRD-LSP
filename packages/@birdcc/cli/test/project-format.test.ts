import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("passes project tab indentation through the real CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "birdcc-cli-project-format-"));
  try {
    const file = join(root, "bird.conf");
    await writeFile(
      file,
      "router id 192.0.2.1;\nprotocol device dev {\n scan time 10;\n}\n",
    );
    await writeFile(
      join(root, "bird.config.json"),
      JSON.stringify({ formatter: { engine: "builtin", useTabs: true } }),
    );
    execFileSync(
      process.execPath,
      [
        fileURLToPath(new URL("../dist/cli.js", import.meta.url)),
        "fmt",
        file,
        "--write",
      ],
      { cwd: root, timeout: 10000, stdio: "pipe" },
    );
    expect(await readFile(file, "utf8")).toContain("\n\tscan time 10;");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
