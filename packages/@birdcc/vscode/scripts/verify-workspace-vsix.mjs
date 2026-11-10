import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { glob } from "tinyglobby";

const execFileAsync = promisify(execFile);
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const hashFile = async (file) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
};

const runtimeManifest = (manifest, versions) => {
  const dependencies = (values = {}) =>
    Object.fromEntries(
      Object.entries(values).map(([name, value]) => {
        if (value !== "workspace:*") return [name, value];
        ok(versions.has(name), `Workspace version missing for ${name}`);
        return [name, versions.get(name)];
      }),
    );
  return {
    name: manifest.name,
    version: manifest.version,
    type: manifest.type,
    main: manifest.main,
    exports: manifest.exports,
    dependencies: dependencies(manifest.dependencies),
    optionalDependencies: dependencies(manifest.optionalDependencies),
  };
};

const verifyFiles = async (source, bundled, patterns, name) => {
  const options = {
    dot: true,
    followSymbolicLinks: false,
    ignore: ["**/.git/**", "**/node_modules/**"],
    signal: AbortSignal.timeout(60_000),
  };
  const expected = (await glob(patterns, { ...options, cwd: source })).sort();
  const actual = (await glob(patterns, { ...options, cwd: bundled })).sort();
  ok(expected.length > 0, `No built package files found for ${name}`);
  deepStrictEqual(actual, expected, `Published file list differs for ${name}`);
  const files = [];
  for (const file of expected) {
    const sourceHash = await hashFile(path.join(source, file));
    strictEqual(
      await hashFile(path.join(bundled, file)),
      sourceHash,
      `Workspace content differs for ${name}/${file}`,
    );
    files.push({ path: file, sha256: sourceHash });
  }
  return files;
};

export const verifyWorkspaceVsix = async ({
  workspaceRoot,
  packageRoot,
  vsixPath,
  extensionName,
  reportPath,
}) => {
  const extensionManifest = await readJson(
    path.join(packageRoot, "package.json"),
  );
  const listProjects = async (selector) => {
    const { stdout } = await execFileAsync(
      "pnpm",
      [...selector, "list", "--json", "--depth", "-1"],
      { cwd: workspaceRoot, timeout: 60_000 },
    );
    return JSON.parse(stdout);
  };
  const projects = await listProjects([
    "--filter",
    `${extensionManifest.name}...`,
  ]);
  // Registry packages may share the @birdcc scope with workspace projects.
  const workspaceNames = new Set(
    (await listProjects(["--recursive"])).map((project) => project.name),
  );
  ok(projects.some((project) => project.name === extensionManifest.name));
  const versions = new Map(
    projects.map((project) => [project.name, project.version]),
  );
  const sourcePackages = new Map(
    projects
      .filter((project) => project.name !== extensionManifest.name)
      .map((project) => [project.name, project]),
  );
  const directory = await mkdtemp(path.join(tmpdir(), "bird2-lsp-verify-"));
  try {
    await execFileAsync("unzip", ["-q", vsixPath, "-d", directory], {
      timeout: 60_000,
    });
    const bundledRoot = path.join(directory, "extension");
    const manifests = await glob("node_modules/**/@birdcc/*/package.json", {
      cwd: bundledRoot,
      dot: true,
      followSymbolicLinks: false,
      signal: AbortSignal.timeout(60_000),
    });
    const bundledPackages = new Map();
    const registryPackages = [];
    for (const file of manifests.sort()) {
      const manifest = await readJson(path.join(bundledRoot, file));
      if (!workspaceNames.has(manifest.name)) {
        registryPackages.push({
          name: manifest.name,
          version: manifest.version,
          path: path.dirname(file),
        });
        continue;
      }
      ok(
        sourcePackages.has(manifest.name),
        `Unexpected internal package ${file}`,
      );
      const copies = bundledPackages.get(manifest.name) ?? [];
      copies.push({ root: path.dirname(file), manifest });
      bundledPackages.set(manifest.name, copies);
    }

    const packageReports = [];
    for (const [name, project] of sourcePackages) {
      const sourceManifest = await readJson(
        path.join(project.path, "package.json"),
      );
      const copies = bundledPackages.get(name) ?? [];
      ok(copies.length > 0, `Internal workspace package missing: ${name}`);
      const copyReports = [];
      for (const copy of copies) {
        deepStrictEqual(
          runtimeManifest(copy.manifest, versions),
          runtimeManifest(sourceManifest, versions),
          `Workspace runtime manifest differs for ${name} at ${copy.root}`,
        );
        const files = await verifyFiles(
          project.path,
          path.join(bundledRoot, copy.root),
          sourceManifest.files,
          name,
        );
        ok(
          files.some(
            (file) => file.path === path.posix.normalize(sourceManifest.main),
          ),
          `Built entrypoint missing for ${name}`,
        );
        copyReports.push({ path: copy.root, files });
      }
      packageReports.push({
        name,
        version: project.version,
        copies: copyReports,
      });
    }

    const bundledManifest = await readJson(
      path.join(bundledRoot, "package.json"),
    );
    deepStrictEqual(
      runtimeManifest(bundledManifest, versions),
      runtimeManifest({ ...extensionManifest, name: extensionName }, versions),
      "Extension runtime manifest differs from the current workspace",
    );
    const extensionFiles = await verifyFiles(
      packageRoot,
      bundledRoot,
      extensionManifest.files.filter(
        (file) => !["README.md", "CHANGELOG.md", "LICENSE"].includes(file),
      ),
      extensionName,
    );
    const report = {
      archive: path.relative(workspaceRoot, vsixPath),
      sha256: await hashFile(vsixPath),
      extension: {
        name: extensionName,
        version: extensionManifest.version,
        files: extensionFiles,
      },
      workspacePackages: packageReports,
      registryPackages,
    };
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(
      `[marketplace] Verified current workspace contents for ${packageReports.length} internal packages; archive SHA256 ${report.sha256}`,
    );
    return report;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === filename) {
  const { values } = parseArgs({
    options: {
      vsix: { type: "string" },
      name: { type: "string" },
      report: { type: "string" },
    },
  });
  ok(
    values.vsix && values.name && values.report,
    "--vsix, --name and --report are required",
  );
  const packageRoot = path.resolve(path.dirname(filename), "..");
  await verifyWorkspaceVsix({
    workspaceRoot: path.resolve(packageRoot, "..", "..", ".."),
    packageRoot,
    vsixPath: path.resolve(values.vsix),
    extensionName: values.name,
    reportPath: path.resolve(values.report),
  });
}
