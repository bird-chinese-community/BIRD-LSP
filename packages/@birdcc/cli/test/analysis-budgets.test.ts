import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("reads project document and total budgets through the real CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "birdcc-cli-budget-"));
  try {
    const file = join(root, "bird.conf");
    const configPath = join(root, "bird.config.json");
    await writeFile(
      file,
      'router id 192.0.2.1;\ninclude "part.conf";\nprotocol device dev {}\n',
    );
    await writeFile(
      join(root, "part.conf"),
      `define LOCAL_AS = 65000;\n#${"x".repeat(150)}\n`,
    );
    const run = () =>
      spawnSync(
        process.execPath,
        [
          fileURLToPath(new URL("../dist/cli.js", import.meta.url)),
          "lint",
          file,
          "--json",
        ],
        { cwd: root, encoding: "utf8", timeout: 10000 },
      );
    await writeFile(
      configPath,
      JSON.stringify({
        crossFile: { maxDocumentBytes: 32, maxTotalBytes: 1024 },
      }),
    );
    const documentLimited = run();
    expect(documentLimited.status).toBe(1);
    expect(documentLimited.stderr).toContain("size limit");
    await writeFile(
      configPath,
      JSON.stringify({
        crossFile: { maxDocumentBytes: 512, maxTotalBytes: 32 },
      }),
    );
    const totalLimited = run();
    expect(totalLimited.status).toBe(1);
    expect(totalLimited.stderr).toContain("size limit");
    await writeFile(
      configPath,
      JSON.stringify({
        crossFile: { maxDocumentBytes: 128, maxTotalBytes: 1024 },
      }),
    );
    const includeLimited = run();
    expect(includeLimited.status).toBe(0);
    expect(
      JSON.parse(includeLimited.stdout).diagnostics.some(
        (item: { message: string }) => item.message.includes("size limit"),
      ),
    ).toBe(true);
    await writeFile(
      configPath,
      JSON.stringify({
        crossFile: { maxDocumentBytes: 512, maxTotalBytes: 1024 },
      }),
    );
    const accepted = run();
    expect(accepted.status).toBe(0);
    expect(
      JSON.parse(accepted.stdout).diagnostics.some(
        (item: { message: string }) => item.message.includes("size limit"),
      ),
    ).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
