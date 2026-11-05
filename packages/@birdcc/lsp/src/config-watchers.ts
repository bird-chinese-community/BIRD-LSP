import { watch, type FSWatcher } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PROJECT_CONFIG_FILE_NAMES = [
  "bird.config.json",
  "birdcc.config.json",
];

export const createProjectConfigWatchers = (
  onChange: (uri: string) => void,
  onError: (directory: string, error: Error) => void,
) => {
  const watchers = new Map<string, FSWatcher>();
  const directoriesByDocument = new Map<string, Set<string>>();
  const dependenciesByDocument = new Map<string, Set<string>>();
  const dependencyOwners = new Map<string, Set<string>>();
  let disposed = false;

  const closeWatcher = (
    directory: string,
    watcher: FSWatcher,
  ): Promise<void> => {
    watchers.delete(directory);
    return new Promise((resolve) => {
      watcher.once("close", resolve);
      watcher.close();
    });
  };

  const ensureWatchers = (directories: Iterable<string>): void => {
    for (const directory of directories) {
      if (watchers.has(directory)) continue;
      let watcher: FSWatcher;
      try {
        watcher = watch(
          directory,
          { persistent: false },
          (_event, filename) => {
            if (watchers.get(directory) !== watcher) return;
            if (filename === null && dependencyOwners.has(directory))
              onChange(pathToFileURL(directory).toString());
            if (
              filename === null &&
              ![...directoriesByDocument.values()].some((directories) =>
                directories.has(directory),
              )
            )
              return;
            const names =
              filename === null
                ? PROJECT_CONFIG_FILE_NAMES
                : [filename.toString()];
            for (const name of names)
              if (
                dependencyOwners.has(directory) ||
                PROJECT_CONFIG_FILE_NAMES.includes(name)
              )
                onChange(pathToFileURL(join(directory, name)).toString());
          },
        );
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !("code" in error) ||
          typeof error.code !== "string" ||
          !("errno" in error) ||
          typeof error.errno !== "number" ||
          !Number.isInteger(error.errno) ||
          error.errno >= 0
        )
          throw error;
        onError(directory, error);
        continue;
      }
      watchers.set(directory, watcher);
      watcher.on("error", (error) => {
        if (watchers.get(directory) === watcher) watchers.delete(directory);
        watcher.close();
        onError(directory, error);
      });
    }
  };

  const removeDependencies = (uri: string): void => {
    for (const directory of dependenciesByDocument.get(uri) ?? []) {
      const owners = dependencyOwners.get(directory);
      owners?.delete(uri);
      if (owners?.size === 0) dependencyOwners.delete(directory);
    }
    dependenciesByDocument.delete(uri);
  };

  const closeUnusedWatchers = async (): Promise<void> => {
    const retained = new Set(
      [...directoriesByDocument.values()].flatMap((directories) => [
        ...directories,
      ]),
    );
    for (const directory of dependencyOwners.keys()) retained.add(directory);
    await Promise.all(
      [...watchers]
        .filter(([directory]) => !retained.has(directory))
        .map(([directory, watcher]) => closeWatcher(directory, watcher)),
    );
  };

  return {
    watch: (uri: string): void => {
      if (disposed)
        throw new Error("Project configuration watchers are disposed");
      const directories = new Set<string>();
      let directory = dirname(fileURLToPath(uri));
      while (true) {
        directories.add(directory);
        const parent = dirname(directory);
        if (parent === directory) break;
        directory = parent;
      }
      directoriesByDocument.set(uri, directories);
      ensureWatchers(directories);
    },
    watchDependencies: (
      uri: string,
      directoryUris: Iterable<string>,
    ): Promise<void> => {
      if (disposed || !directoriesByDocument.has(uri))
        throw new Error(`Project watcher owner is not active: ${uri}`);
      const directories = new Set(
        [...directoryUris].map((directoryUri) => fileURLToPath(directoryUri)),
      );
      removeDependencies(uri);
      dependenciesByDocument.set(uri, directories);
      for (const directory of directories) {
        const owners = dependencyOwners.get(directory) ?? new Set<string>();
        owners.add(uri);
        dependencyOwners.set(directory, owners);
      }
      ensureWatchers(directories);
      return closeUnusedWatchers();
    },
    clearDependencies: (uri: string): Promise<void> => {
      removeDependencies(uri);
      return closeUnusedWatchers();
    },
    unwatch: (uri: string): Promise<void> => {
      directoriesByDocument.delete(uri);
      removeDependencies(uri);
      return closeUnusedWatchers();
    },
    dispose: async (): Promise<void> => {
      disposed = true;
      directoriesByDocument.clear();
      dependenciesByDocument.clear();
      dependencyOwners.clear();
      await Promise.all(
        [...watchers].map(([directory, watcher]) =>
          closeWatcher(directory, watcher),
        ),
      );
    },
  };
};
