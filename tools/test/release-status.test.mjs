import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { createRelease } from "../tegami-config.mjs";
import { validateReleaseChanges } from "../release-changes.mjs";

const temporaryRoot = new URL("../../.tmp/", import.meta.url);
await mkdir(temporaryRoot, { recursive: true });
const directory = await mkdtemp(new URL("release-record-", temporaryRoot));
after(() => rm(directory, { recursive: true, force: true }));
await writeFile(
  path.join(directory, "cli-update.md"),
  [
    "---",
    "packages:",
    '  "@birdcc/cli": patch',
    "---",
    "",
    "## Update CLI output",
    "",
  ].join("\n"),
);
await writeFile(
  path.join(directory, "empty.md"),
  "---\npackages: {}\n---\n\n## Maintenance\n",
);
await writeFile(
  path.join(directory, "unknown.md"),
  "---\npackages:\n  missing-package: patch\n---\n\n## Unknown package\n",
);
const paper = createRelease({ changelogDir: directory });
const draft = await paper.draft();
const { graph } = await paper._internal.context();
const validate = (changedFiles) =>
  validateReleaseChanges({
    changedFiles,
    changelogs: draft.getChangelogs(),
    graph,
  });

test("old pending entries do not cover a product PR without a new record", () => {
  assert.throws(
    () => validate(["packages/@birdcc/cli/src/index.ts"]),
    /native .tegami/,
  );
});
test("a native record added by the current PR covers its package change", () => {
  assert.doesNotThrow(() =>
    validate(["packages/@birdcc/cli/src/index.ts", ".tegami/cli-update.md"]),
  );
});
test("empty and unknown package mappings do not cover product changes", () => {
  for (const filename of ["empty.md", "unknown.md"]) {
    assert.throws(
      () =>
        validate(["packages/@birdcc/cli/package.json", `.tegami/${filename}`]),
      /native .tegami/,
    );
  }
});
test("documentation and test maintenance do not require a package bump", () => {
  assert.doesNotThrow(() =>
    validate(["docs/releasing.md", "packages/@birdcc/cli/test/cli.test.ts"]),
  );
});
