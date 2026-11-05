import { createHook } from "node:async_hooks";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import {
  createProjectConfigWatchers,
  PROJECT_CONFIG_FILE_NAMES,
} from "../src/config-watchers.js";

const watchBoundary = vi.hoisted(() => ({
  directory: "",
  error: undefined as Error | undefined,
}));

vi.mock("node:fs", async (importOriginal) => {
  const native = await importOriginal<typeof import("node:fs")>();
  return {
    ...native,
    watch: (...args: Parameters<typeof native.watch>) => {
      if (args[0] === watchBoundary.directory && watchBoundary.error)
        throw watchBoundary.error;
      return native.watch(...args);
    },
  };
});

afterEach(() => {
  watchBoundary.directory = "";
  watchBoundary.error = undefined;
});

it.each(PROJECT_CONFIG_FILE_NAMES)(
  "observes an immediate %s write after synchronous registration",
  async (name) => {
    const root = await mkdtemp(join(tmpdir(), "birdcc-config-watch-"));
    const changed: string[] = [];
    const errors: Error[] = [];
    const watchers = createProjectConfigWatchers(
      (uri) => changed.push(uri),
      (_directory, error) => errors.push(error),
    );
    try {
      const config = join(root, name);
      await writeFile(
        config,
        JSON.stringify({ crossFile: { enabled: false } }),
      );
      watchers.watch(pathToFileURL(join(root, "bird.conf")).toString());
      await writeFile(join(root, "unrelated.txt"), "unrelated");
      await writeFile(config, JSON.stringify({ crossFile: { enabled: true } }));
      await vi.waitFor(
        () => expect(changed).toContain(pathToFileURL(config).toString()),
        { timeout: 10000 },
      );
      expect(changed).not.toContain(
        pathToFileURL(join(root, "unrelated.txt")).toString(),
      );
      expect(errors).toEqual([]);
    } finally {
      await watchers.dispose();
      await rm(root, { recursive: true, force: true });
    }
  },
);

it("reports an injected native watch failure and keeps available directories live", async () => {
  const root = await mkdtemp(join(tmpdir(), "birdcc-watch-error-"));
  const changed: string[] = [];
  const errors: { directory: string; error: Error }[] = [];
  const watchers = createProjectConfigWatchers(
    (uri) => changed.push(uri),
    (directory, error) => errors.push({ directory, error }),
  );
  try {
    const project = join(root, "project");
    await mkdir(project);
    const failure = Object.assign(new Error("injected watch denial"), {
      code: "EACCES",
      errno: -13,
    });
    watchBoundary.directory = root;
    watchBoundary.error = failure;
    watchers.watch(pathToFileURL(join(project, "bird.conf")).toString());
    expect(errors).toEqual([{ directory: root, error: failure }]);
    const config = pathToFileURL(join(project, "bird.config.json"));
    await writeFile(config, "{}");
    await vi.waitFor(() => expect(changed).toContain(config.toString()), {
      timeout: 10000,
    });
  } finally {
    await watchers.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

it("propagates an unexpected directory watcher error unchanged", async () => {
  expect.assertions(2);
  const root = await mkdtemp(join(tmpdir(), "birdcc-watch-type-error-"));
  const errors: Error[] = [];
  const watchers = createProjectConfigWatchers(
    () => undefined,
    (_directory, error) => errors.push(error),
  );
  const failure = new TypeError("invalid watcher contract");
  watchBoundary.directory = root;
  watchBoundary.error = failure;
  try {
    try {
      watchers.watch(pathToFileURL(join(root, "bird.conf")).toString());
    } catch (error) {
      expect(error).toBe(failure);
      expect(errors).toEqual([]);
    }
  } finally {
    await watchers.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

it("retains shared include monitoring while graphs and document owners change", async () => {
  const root = await mkdtemp(join(tmpdir(), "birdcc-include-owners-"));
  const changed: string[] = [];
  const errors: Error[] = [];
  const activeHandles = new Set<number>();
  const hook = createHook({
    init: (id, type) => {
      if (type === "FSEVENTWRAP") activeHandles.add(id);
    },
    destroy: (id) => activeHandles.delete(id),
  }).enable();
  const watchers = createProjectConfigWatchers(
    (uri) => changed.push(uri),
    (_directory, error) => errors.push(error),
  );
  try {
    const first = join(root, "first");
    const second = join(root, "second");
    const shared = join(root, "shared");
    const replacement = join(root, "replacement");
    for (const directory of [first, second, shared, replacement])
      await mkdir(directory);
    const firstUri = pathToFileURL(join(first, "bird.conf")).toString();
    const secondUri = pathToFileURL(join(second, "bird.conf")).toString();
    watchers.watch(firstUri);
    watchers.watch(secondUri);
    const configHandleCount = activeHandles.size;
    const sharedUri = pathToFileURL(shared).toString();
    await watchers.watchDependencies(firstUri, [sharedUri]);
    expect(activeHandles.size).toBe(configHandleCount + 1);
    await watchers.watchDependencies(secondUri, [sharedUri]);
    expect(activeHandles.size).toBe(configHandleCount + 1);
    await watchers.clearDependencies(firstUri);
    const sharedFile = pathToFileURL(join(shared, "closed.inc"));
    await writeFile(sharedFile, "template bgp shared { local as 65000; }\n");
    await vi.waitFor(() => expect(changed).toContain(sharedFile.toString()), {
      timeout: 10000,
    });

    await watchers.watchDependencies(firstUri, [
      pathToFileURL(replacement).toString(),
    ]);
    expect(activeHandles.size).toBe(configHandleCount + 2);
    await watchers.clearDependencies(secondUri);
    await vi.waitFor(
      () => expect(activeHandles.size).toBe(configHandleCount + 1),
      { timeout: 10000 },
    );
    let after = changed.length;
    await writeFile(sharedFile, "removed owner\n");
    const currentFile = pathToFileURL(join(replacement, "current.inc"));
    await writeFile(currentFile, "template bgp current { local as 65001; }\n");
    await vi.waitFor(
      () => expect(changed.slice(after)).toContain(currentFile.toString()),
      { timeout: 10000 },
    );
    expect(changed.slice(after)).not.toContain(sharedFile.toString());

    await watchers.unwatch(firstUri);
    await vi.waitFor(
      () => expect(activeHandles.size).toBe(configHandleCount - 1),
      { timeout: 10000 },
    );
    after = changed.length;
    const config = pathToFileURL(join(second, "bird.config.json"));
    await writeFile(config, "{}");
    await vi.waitFor(
      () => expect(changed.slice(after)).toContain(config.toString()),
      { timeout: 10000 },
    );
    expect(errors).toEqual([]);
  } finally {
    await watchers.dispose();
    try {
      await vi.waitFor(() => expect(activeHandles.size).toBe(0), {
        timeout: 10000,
      });
    } finally {
      hook.disable();
      await rm(root, { recursive: true, force: true });
    }
  }
}, 60000);

it("shares native directory handles and releases each final document owner", async () => {
  const root = await mkdtemp(join(tmpdir(), "birdcc-config-owners-"));
  const changed: string[] = [];
  const errors: Error[] = [];
  const activeHandles = new Set<number>();
  const hook = createHook({
    init: (id, type) => {
      if (type === "FSEVENTWRAP") activeHandles.add(id);
    },
    destroy: (id) => {
      activeHandles.delete(id);
    },
  }).enable();
  const watchers = createProjectConfigWatchers(
    (uri) => changed.push(uri),
    (_directory, error) => errors.push(error),
  );
  try {
    const first = join(root, "first");
    const second = join(root, "second");
    await mkdir(first);
    await mkdir(second);
    const firstUri = pathToFileURL(join(first, "bird.conf")).toString();
    const sharedUri = pathToFileURL(join(first, "other.conf")).toString();
    const secondUri = pathToFileURL(join(second, "bird.conf")).toString();
    watchers.watch(firstUri);
    const firstHandleCount = activeHandles.size;
    expect(firstHandleCount).toBeGreaterThan(0);
    watchers.watch(sharedUri);
    expect(activeHandles.size).toBe(firstHandleCount);
    watchers.watch(secondUri);
    expect(activeHandles.size).toBe(firstHandleCount + 1);

    await watchers.unwatch(firstUri);
    expect(activeHandles.size).toBe(firstHandleCount + 1);
    const firstConfig = pathToFileURL(join(first, "bird.config.json"));
    await writeFile(firstConfig, "{}");
    await vi.waitFor(() => expect(changed).toContain(firstConfig.toString()), {
      timeout: 10000,
    });

    await watchers.unwatch(sharedUri);
    await vi.waitFor(() => expect(activeHandles.size).toBe(firstHandleCount), {
      timeout: 10000,
    });
    const afterClose = changed.length;
    await writeFile(firstConfig, JSON.stringify({ main: "closed.conf" }));
    const secondConfig = pathToFileURL(join(second, "bird.config.json"));
    await writeFile(secondConfig, "{}");
    await vi.waitFor(
      () =>
        expect(changed.slice(afterClose)).toContain(secondConfig.toString()),
      { timeout: 10000 },
    );
    expect(changed.slice(afterClose)).not.toContain(firstConfig.toString());
    expect(errors).toEqual([]);
  } finally {
    await watchers.dispose();
    try {
      await vi.waitFor(() => expect(activeHandles.size).toBe(0), {
        timeout: 10000,
      });
    } finally {
      hook.disable();
      await rm(root, { recursive: true, force: true });
    }
  }
}, 30000);
