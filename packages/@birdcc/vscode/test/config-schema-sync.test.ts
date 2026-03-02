import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { extensionConfigurationFields } from "../src/config/schema.js";

const readExtensionManifest = async (): Promise<Record<string, unknown>> => {
  const manifestPath = new URL("../package.json", import.meta.url);
  const manifestText = await readFile(manifestPath, "utf8");
  return JSON.parse(manifestText) as Record<string, unknown>;
};

describe("configuration schema sync", () => {
  it("keeps package.json configuration keys and defaults aligned", async () => {
    const manifest = await readExtensionManifest();
    const contributes = manifest.contributes as
      | {
          configuration?: {
            properties?: Record<string, { default?: unknown }>;
          };
        }
      | undefined;
    const properties = contributes?.configuration?.properties ?? {};

    for (const field of Object.values(extensionConfigurationFields)) {
      const property = properties[field.packageKey];
      expect(
        property,
        `${field.packageKey} should exist in package.json`,
      ).toBeDefined();
      expect(property?.default).toEqual(field.defaultValue);
    }
  });
});
