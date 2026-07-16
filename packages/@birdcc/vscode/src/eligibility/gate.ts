import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, normalize, resolve } from "node:path";
import { evaluateBirdDocumentEligibility } from "@birdcc/core";
import { workspace, type Disposable, type TextDocument } from "vscode";

const CONFIG_FILE_NAMES = ["bird.config.json", "birdcc.config.json"] as const;

interface EligibilityCacheEntry {
  readonly version: number;
  readonly eligible: boolean;
}

interface BirdConfigWithMain {
  readonly main: string;
}

const isBirdConfigWithMain = (value: unknown): value is BirdConfigWithMain =>
  typeof value === "object" &&
  value !== null &&
  "main" in value &&
  typeof value.main === "string";

export interface BirdDocumentEligibilityGate extends Disposable {
  isEligible: (document: TextDocument) => Promise<boolean>;
  clear: () => void;
}

const normalizeForComparison = (filePath: string): string => {
  const normalized = normalize(resolve(filePath));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
};

const findExplicitMain = async (document: TextDocument): Promise<boolean> => {
  if (document.uri.scheme !== "file") {
    return false;
  }

  const documentPath = normalizeForComparison(document.uri.fsPath);
  const workspaceRoot = workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
  const stopPath = workspaceRoot
    ? normalizeForComparison(workspaceRoot)
    : undefined;
  let current = dirname(documentPath);

  while (true) {
    for (const fileName of CONFIG_FILE_NAMES) {
      try {
        const configPath = resolve(current, fileName);
        const parsed: unknown = JSON.parse(await readFile(configPath, "utf8"));
        if (!isBirdConfigWithMain(parsed) || parsed.main.trim().length === 0) {
          continue;
        }

        const mainPath = isAbsolute(parsed.main)
          ? parsed.main
          : resolve(current, parsed.main);
        return normalizeForComparison(mainPath) === documentPath;
      } catch {
        // Missing or invalid project configuration does not authorize the file.
      }
    }

    if (stopPath && normalizeForComparison(current) === stopPath) {
      return false;
    }
    const parent = dirname(current);
    if (parent === current) {
      return false;
    }
    current = parent;
  }
};

export const createBirdDocumentEligibilityGate =
  (): BirdDocumentEligibilityGate => {
    const cache = new Map<string, EligibilityCacheEntry>();
    const explicitMainByUri = new Map<string, boolean>();
    const pending = new Map<string, Promise<boolean>>();
    let generation = 0;
    const clear = (): void => {
      generation += 1;
      cache.clear();
      explicitMainByUri.clear();
      pending.clear();
    };

    const configWatcher = workspace.createFileSystemWatcher(
      "**/{bird.config.json,birdcc.config.json}",
    );
    const subscriptions: Disposable[] = [
      configWatcher,
      configWatcher.onDidCreate(clear),
      configWatcher.onDidChange(clear),
      configWatcher.onDidDelete(clear),
      workspace.onDidChangeWorkspaceFolders(clear),
      workspace.onDidCloseTextDocument((document) => {
        const uri = document.uri.toString();
        cache.delete(uri);
        explicitMainByUri.delete(uri);
      }),
    ];

    const isEligible = async (document: TextDocument): Promise<boolean> => {
      const uri = document.uri.toString();
      const cached = cache.get(uri);
      if (cached?.version === document.version) {
        return cached.eligible;
      }

      const pendingKey = `${uri}@${document.version}`;
      const pendingResult = pending.get(pendingKey);
      if (pendingResult) {
        return pendingResult;
      }

      const taskGeneration = generation;
      const task = (async (): Promise<boolean> => {
        let explicitMain = explicitMainByUri.get(uri);
        if (explicitMain === undefined) {
          explicitMain = await findExplicitMain(document);
          if (taskGeneration === generation) {
            explicitMainByUri.set(uri, explicitMain);
          }
        }
        const eligibility = await evaluateBirdDocumentEligibility(
          document.getText(),
          {
            filePath:
              document.uri.scheme === "file" ? document.uri.fsPath : undefined,
            explicitMain,
          },
        );
        if (taskGeneration === generation) {
          cache.set(uri, {
            version: document.version,
            eligible: eligibility.eligible,
          });
        }
        return eligibility.eligible;
      })();

      pending.set(pendingKey, task);
      try {
        return await task;
      } finally {
        pending.delete(pendingKey);
      }
    };

    return {
      isEligible,
      clear,
      dispose: () => {
        for (const subscription of subscriptions) {
          subscription.dispose();
        }
        clear();
      },
    };
  };
