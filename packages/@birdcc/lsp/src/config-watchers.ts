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
      for (const directory of directories) {
        if (watchers.has(directory)) continue;
        let watcher: FSWatcher;
        try {
          watcher = watch(
            directory,
            { persistent: false },
            (_event, filename) => {
              if (watchers.get(directory) !== watcher) return;
              const names =
                filename === null
                  ? PROJECT_CONFIG_FILE_NAMES
                  : [filename.toString()];
              for (const name of names)
                if (PROJECT_CONFIG_FILE_NAMES.includes(name))
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
    },
    unwatch: async (uri: string): Promise<void> => {
      directoriesByDocument.delete(uri);
      const retained = new Set(
        [...directoriesByDocument.values()].flatMap((directories) => [
          ...directories,
        ]),
      );
      await Promise.all(
        [...watchers]
          .filter(([directory]) => !retained.has(directory))
          .map(([directory, watcher]) => closeWatcher(directory, watcher)),
      );
    },
    dispose: async (): Promise<void> => {
      disposed = true;
      directoriesByDocument.clear();
      await Promise.all(
        [...watchers].map(([directory, watcher]) =>
          closeWatcher(directory, watcher),
        ),
      );
    },
  };
};
