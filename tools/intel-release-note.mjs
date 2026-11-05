import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const diff = spawnSync(
  "git",
  ["diff", "--quiet", "--", "packages/@birdcc/intel/db"],
  { stdio: "inherit" },
);
if (diff.error) throw diff.error;
if (diff.status !== 0 && diff.status !== 1) {
  throw new Error(
    `Could not inspect the ASN database changes (${diff.status})`,
  );
}
if (diff.status === 1) {
  await mkdir(".tegami", { recursive: true });
  await writeFile(
    ".tegami/weekly-intel-database.md",
    [
      "---",
      "packages:",
      '  "@birdcc/intel": patch',
      "---",
      "",
      "## Refresh ASN intelligence data",
      "",
      "Update the bundled ASN database from its configured public sources.",
      "",
    ].join("\n"),
  );
}
