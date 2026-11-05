import { fileURLToPath } from "node:url";
import { tegami } from "tegami";
import { cargo } from "tegami/plugins/cargo";
import { github } from "tegami/plugins/github";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));
const formatterNpmId = "npm:@birdcc/dprint-plugin-bird";
const formatterCargoId = "cargo:dprint-plugin-bird";
const editorIds = ["npm:@birdcc/vscode", "npm:bird2-extension-pack"];

const sharedFormatterChangelog = {
  name: "shared-formatter-changelog",
  applyDraft(draft) {
    const npmDraft = draft.getPackageDraft(formatterNpmId);
    const cargoDraft = draft.getPackageDraft(formatterCargoId);
    if (!cargoDraft?.changelogs?.length) return;
    if (!npmDraft) throw new Error("The formatter npm release unit is missing");

    // Both providers share a package directory and one changelog file.
    npmDraft.changelogs = [
      ...new Map(
        [...(npmDraft.changelogs ?? []), ...cargoDraft.changelogs].map(
          (entry) => [entry.id, entry],
        ),
      ).values(),
    ];
    cargoDraft.changelogs = [];
  },
};

const publishingPolicy = {
  name: "birdcc-publishing-policy",
  resolve() {
    for (const id of editorIds) {
      const pkg = this.graph.get(id);
      if (!pkg || pkg.manifest.private !== true) {
        throw new Error(`${id} must remain a private npm package`);
      }
    }
    const formatter = this.graph.get(formatterCargoId);
    if (!formatter || formatter.manifest.package.publish !== false) {
      throw new Error(`${formatterCargoId} must set publish = false`);
    }
  },
  willPublish({ pkg }) {
    if (editorIds.includes(pkg.id) || pkg.id === formatterCargoId) {
      throw new Error(
        `${pkg.id} is distributed through its editor or npm package`,
      );
    }
  },
};

export const createRelease = ({
  githubIntegration = false,
  changelogDir,
} = {}) =>
  tegami({
    cwd: workspaceRoot,
    changelogDir,
    groups: {
      birdcc: { syncBump: true },
    },
    packages: {
      "@birdcc/parser": { group: "birdcc" },
      "@birdcc/core": { group: "birdcc" },
      "@birdcc/linter": { group: "birdcc" },
      "@birdcc/lsp": { group: "birdcc" },
      "@birdcc/formatter": { group: "birdcc" },
      "@birdcc/cli": { group: "birdcc" },
      "@birdcc/dprint-plugin-bird": { group: "birdcc" },
      "dprint-plugin-bird": { group: "birdcc" },
    },
    npm: { client: "pnpm", updateLockFile: true },
    plugins: [
      cargo(),
      sharedFormatterChangelog,
      publishingPolicy,
      ...(githubIntegration
        ? [
            github({
              repo: "bird-chinese-community/BIRD-LSP",
              versionPr: {
                base: "main",
                branch: "feat/tegami-version-packages",
                create: () => ({ title: "chore(release): Version packages" }),
                commit: ({ type }) => ({
                  title:
                    type === "version-packages"
                      ? "chore(release): Version packages"
                      : "chore(release): Update publish lock",
                }),
              },
            }),
          ]
        : []),
    ],
  });
