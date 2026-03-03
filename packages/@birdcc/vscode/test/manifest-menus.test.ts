import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const readExtensionManifest = async (): Promise<Record<string, unknown>> => {
  const manifestPath = new URL("../package.json", import.meta.url);
  const manifestText = await readFile(manifestPath, "utf8");
  return JSON.parse(manifestText) as Record<string, unknown>;
};

describe("extension manifest menus", () => {
  it("contributes bird2 editor context menu commands", async () => {
    const manifest = await readExtensionManifest();
    const contributes = manifest.contributes as
      | {
          menus?: {
            "editor/context"?: Array<{ command?: string }>;
          };
        }
      | undefined;
    const editorContextMenus = contributes?.menus?.["editor/context"] ?? [];
    const commandIds = editorContextMenus.map((menu) => menu.command);

    expect(commandIds).toContain("bird2-lsp.validateActiveDocument");
    expect(commandIds).toContain("bird2-lsp.formatActiveDocument");
  });
});
