import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { resolveCrossFileReferences } from "../src/cross-file.js";
import { collectCandidateFiles } from "../src/detection/collector.js";

it("applies document and aggregate budgets to normal in-memory graphs", async () => {
  const entryUri = "file:///birdcc-limits/main.conf";
  const documents = [
    { uri: entryUri, text: 'include "part.conf";\n' },
    {
      uri: "file:///birdcc-limits/part.conf",
      text: "template bgp base { local as 65000; }\n",
    },
  ];
  const single = await resolveCrossFileReferences({
    entryUri,
    documents,
    loadFromFileSystem: false,
    maxDocumentBytes: 16,
  });
  expect(single.visitedUris).toEqual([]);
  expect(single.stats.skippedBySizeLimit).toBe(1);
  const aggregate = await resolveCrossFileReferences({
    entryUri,
    documents,
    loadFromFileSystem: false,
    maxDocumentBytes: 100,
    maxTotalBytes: 40,
  });
  expect(aggregate.visitedUris).toEqual([entryUri]);
  expect(aggregate.stats.totalBytes).toBe(Buffer.byteLength(documents[0].text));
  expect(aggregate.stats.skippedBySizeLimit).toBe(1);
  expect(
    aggregate.diagnostics.some(
      (item) => item.uri === entryUri && item.message.includes("size limit"),
    ),
  ).toBe(true);
});

it("checks real targets, regular files, and bounded disk reads", async () => {
  const root = await mkdtemp(join(tmpdir(), "birdcc-real-path-"));
  try {
    const workspace = join(root, "workspace");
    await mkdir(workspace);
    await writeFile(
      join(workspace, "part.conf"),
      "template bgp base { local as 65000; }\n",
    );
    await symlink(join(workspace, "part.conf"), join(workspace, "alias.conf"));
    const main = join(workspace, "bird.conf");
    await writeFile(main, 'include "alias.conf";\n');
    const entryUri = pathToFileURL(main).toString();
    const options = {
      entryUri,
      workspaceRootUri: pathToFileURL(workspace).toString(),
    };
    expect(
      (await resolveCrossFileReferences(options)).visitedUris,
    ).toHaveLength(2);
    await writeFile(
      join(root, "synthetic.conf"),
      "template bgp outside { local as 65000; }\n",
    );
    await symlink(
      join(root, "synthetic.conf"),
      join(workspace, "external.conf"),
    );
    await writeFile(main, 'include "external.conf";\n');
    const restricted = await resolveCrossFileReferences(options);
    expect(restricted.visitedUris).toEqual([entryUri]);
    expect(
      restricted.diagnostics.some((item) =>
        item.message.includes("outside workspace root"),
      ),
    ).toBe(true);
    await writeFile(main, 'include "part.conf";\n');
    const bounded = await resolveCrossFileReferences({
      ...options,
      maxDocumentBytes: 25,
    });
    expect(bounded.visitedUris).toEqual([entryUri]);
    expect(bounded.stats.skippedBySizeLimit).toBe(1);
    await writeFile(main, 'include "directory.conf";\n');
    await mkdir(join(workspace, "directory.conf"));
    expect(
      (await resolveCrossFileReferences(options)).diagnostics.some((item) =>
        item.message.includes("regular file"),
      ),
    ).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("resolves disk includes through later search paths before reporting missing files", async () => {
  const root = await mkdtemp(join(tmpdir(), "birdcc-include-search-"));
  try {
    const shared = join(root, "shared");
    await mkdir(shared);
    const main = join(root, "bird.conf");
    const part = join(shared, "part.conf");
    await writeFile(main, 'include "part.conf";\n');
    await writeFile(part, "template bgp base { local as 65000; }\n");
    const entryUri = pathToFileURL(main).toString();
    const options = {
      entryUri,
      includeSearchPaths: [join(root, "absent"), shared],
    };

    const resolved = await resolveCrossFileReferences(options);
    expect(resolved.visitedUris).toEqual([
      entryUri,
      pathToFileURL(part).toString(),
    ]);
    expect(resolved.stats.missingIncludes).toBe(0);
    expect(
      resolved.diagnostics.filter(
        (item) => item.code === "semantic/missing-include",
      ),
    ).toEqual([]);

    await writeFile(main, 'include "missing.conf";\n');
    const missing = await resolveCrossFileReferences(options);
    expect(missing.visitedUris).toEqual([entryUri]);
    expect(missing.stats.missingIncludes).toBe(1);
    expect(missing.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "semantic/missing-include",
          uri: entryUri,
          message: "Included file not found in workspace: 'missing.conf'",
        }),
      ]),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("retains unreadable and size-limited search-path include diagnostics", async () => {
  const root = await mkdtemp(join(tmpdir(), "birdcc-include-errors-"));
  try {
    const shared = join(root, "shared");
    await mkdir(shared);
    const main = join(root, "bird.conf");
    await writeFile(main, 'include "directory.conf";\n');
    await mkdir(join(shared, "directory.conf"));
    const entryUri = pathToFileURL(main).toString();
    const options = { entryUri, includeSearchPaths: [shared] };

    const unreadable = await resolveCrossFileReferences(options);
    expect(unreadable.visitedUris).toEqual([entryUri]);
    expect(unreadable.stats.missingIncludes).toBe(1);
    expect(
      unreadable.diagnostics.some(
        (item) =>
          item.uri === entryUri && item.message.includes("regular file"),
      ),
    ).toBe(true);

    await writeFile(main, 'include "large.conf";\n');
    await writeFile(join(shared, "large.conf"), `#${" ".repeat(128)}\n`);
    const bounded = await resolveCrossFileReferences({
      ...options,
      maxDocumentBytes: 64,
    });
    expect(bounded.visitedUris).toEqual([entryUri]);
    expect(bounded.stats.skippedBySizeLimit).toBe(1);
    expect(
      bounded.diagnostics.some(
        (item) => item.uri === entryUri && item.message.includes("size limit"),
      ),
    ).toBe(true);

    await writeFile(main, 'include "*.conf";\n');
    const small = join(shared, "small.conf");
    await writeFile(small, "template bgp base {}\n");
    const wildcard = await resolveCrossFileReferences({
      ...options,
      maxDocumentBytes: 64,
    });
    expect(wildcard.visitedUris).toContain(pathToFileURL(small).toString());
    expect(wildcard.stats.skippedBySizeLimit).toBe(1);
    expect(
      wildcard.diagnostics.some(
        (item) => item.uri === entryUri && item.message.includes("size limit"),
      ),
    ).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("bounds ordinary directory entries and queued directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "birdcc-discovery-limits-"));
  try {
    await writeFile(join(root, "one.txt"), "one");
    await writeFile(join(root, "two.txt"), "two");
    const entries = await collectCandidateFiles(root, { maxEntries: 1 });
    expect(entries.truncated).toBe(true);
    expect(
      entries.warnings.some(
        (item) => item.code === "detection/entry-limit-reached",
      ),
    ).toBe(true);
    await mkdir(join(root, "first"));
    await mkdir(join(root, "second"));
    const directories = await collectCandidateFiles(root, {
      maxDirectories: 1,
    });
    expect(directories.truncated).toBe(true);
    expect(
      directories.warnings.some(
        (item) => item.code === "detection/directory-limit-reached",
      ),
    ).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
