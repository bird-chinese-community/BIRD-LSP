import assert from "node:assert/strict";
import path from "node:path";

export const validateReleaseChanges = ({ changedFiles, changelogs, graph }) => {
  const changesPublishedFiles = changedFiles.some(
    (file) =>
      file.startsWith("packages/") &&
      !file.endsWith(".md") &&
      !file.includes("/test/") &&
      !file.includes("/test-e2e/") &&
      !file.endsWith("LICENSE"),
  );
  const changedEntries = changelogs.filter(
    (entry) =>
      changedFiles.includes(path.posix.join(".tegami", entry.filename)) &&
      [...entry.packages.keys()].some(
        (name) => graph.getByName(name).length > 0,
      ),
  );
  assert.ok(
    !changesPublishedFiles || changedEntries.length > 0,
    "Package changes require a native .tegami changelog with a package bump and heading",
  );
};
