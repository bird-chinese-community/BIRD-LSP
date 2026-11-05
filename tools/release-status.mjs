import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { createRelease } from "./tegami-config.mjs";
import { validateReleaseChanges } from "./release-changes.mjs";

const { values } = parseArgs({
  options: {
    "expect-version": { type: "string" },
    since: { type: "string" },
  },
});
const paper = createRelease();
const draft = await paper.draft();
const context = await paper._internal.context();
if (values.since && process.env.TEGAMI_VERSION_PR !== "1") {
  const changedFiles = execFileSync(
    "git",
    ["diff", "--name-only", "-z", `${values.since}...HEAD`],
    { cwd: context.cwd, encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);
  validateReleaseChanges({
    changedFiles,
    changelogs: draft.getChangelogs(),
    graph: context.graph,
  });
}
const packages = [...draft.getPackageDrafts()].flatMap(([id, entry]) => {
  const pkg = context.graph.get(id);
  assert.ok(pkg, `Release package ${id} was not discovered`);
  const nextVersion = entry.bumpVersion(pkg);
  if (!pkg.version) return [];

  return [
    {
      id,
      version: pkg.version,
      nextVersion,
      type: entry.type ?? null,
      publish:
        pkg.manager === "npm"
          ? pkg.manifest.private !== true
          : pkg.manifest.package.publish !== false,
      changelogs: entry.changelogs?.map((log) => log.filename) ?? [],
    },
  ];
});

if (values["expect-version"]) {
  assert.equal(
    packages.length,
    11,
    "Expected ten npm packages and one Cargo crate",
  );
  for (const pkg of packages) {
    assert.equal(pkg.nextVersion, values["expect-version"], pkg.id);
  }
  assert.equal(packages.filter((pkg) => pkg.publish).length, 8);
}

process.stdout.write(
  `${JSON.stringify({ pending: draft.hasPending(), packages }, null, 2)}\n`,
);
