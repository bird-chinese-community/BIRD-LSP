import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const workspaceRoot = path.resolve(path.dirname(scriptPath), "..");
const releaseBaseUrl =
  "https://github.com/bird-chinese-community/BIRD-LSP/releases/tag";

const releasePackages = [
  {
    key: "extension",
    manifestPath: "packages/@birdcc/vscode/package.json",
    changelogPath: "packages/@birdcc/vscode/CHANGELOG.md",
    marketplaceName: "bird2-lsp",
    releaseTagPrefix: "bird2-lsp-v",
  },
  {
    key: "pack",
    manifestPath: "packages/@birdcc/vscode-pack/package.json",
    changelogPath: "packages/@birdcc/vscode-pack/CHANGELOG.md",
    marketplaceName: "bird2-extension-pack",
  },
];

const isDecimalComponent = (value) =>
  value.length > 0 &&
  [...value].every((character) => character >= "0" && character <= "9") &&
  (value === "0" || !value.startsWith("0"));

const validateMarketplaceVersion = (version, label) => {
  if (typeof version !== "string") {
    throw new Error(`${label} version must be a string`);
  }

  const components = version.split(".");
  if (components.length !== 3 || !components.every(isDecimalComponent)) {
    throw new Error(
      `${label} version must use the stable major.minor.patch format: ${version}`,
    );
  }
};

export const validateMarketplaceManifest = (manifest, label) => {
  validateMarketplaceVersion(manifest.version, label);

  if (manifest.private !== true) {
    throw new Error(
      `${label} must remain private to prevent npm publication; use the Marketplace workflow instead`,
    );
  }

  if (!manifest.publisher) {
    throw new Error(`${label} publisher is missing`);
  }
};

export const validateChangelogEntry = ({
  changelog,
  changelogPath,
  version,
  releaseTag,
}) => {
  if (!changelog.includes(`## [${version}]`)) {
    throw new Error(`${changelogPath} has no entry for ${version}`);
  }

  if (!releaseTag) {
    return;
  }

  const expectedLink = `[${version}]: ${releaseBaseUrl}/${releaseTag}`;
  const changelogLines = changelog.split("\n").map((line) => line.trim());
  if (!changelogLines.includes(expectedLink)) {
    throw new Error(
      `${changelogPath} must define the release link: ${expectedLink}`,
    );
  }
};

const loadReleasePackage = async (releasePackage) => {
  const manifest = JSON.parse(
    await readFile(
      path.join(workspaceRoot, releasePackage.manifestPath),
      "utf8",
    ),
  );
  const changelog = await readFile(
    path.join(workspaceRoot, releasePackage.changelogPath),
    "utf8",
  );

  validateMarketplaceManifest(manifest, releasePackage.marketplaceName);
  const releaseTag = releasePackage.releaseTagPrefix
    ? `${releasePackage.releaseTagPrefix}${manifest.version}`
    : undefined;

  validateChangelogEntry({
    changelog,
    changelogPath: releasePackage.changelogPath,
    version: manifest.version,
    releaseTag,
  });

  return {
    ...releasePackage,
    publisher: manifest.publisher,
    releaseTag,
    version: manifest.version,
  };
};

const main = async () => {
  const [extension, pack] = await Promise.all(
    releasePackages.map(loadReleasePackage),
  );

  if (extension.publisher !== pack.publisher) {
    throw new Error(
      `Extension publishers do not match: ${extension.publisher} and ${pack.publisher}`,
    );
  }

  const releaseInfo = {
    extension_version: extension.version,
    pack_version: pack.version,
    // The extension pack ships in this same release; its independent version is recorded in the body.
    release_tag: extension.releaseTag,
  };

  process.stdout.write(`${JSON.stringify(releaseInfo, null, 2)}\n`);

  if (process.env.GITHUB_OUTPUT) {
    const output = Object.entries(releaseInfo)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
    await appendFile(process.env.GITHUB_OUTPUT, `${output}\n`, "utf8");
  }
};

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
