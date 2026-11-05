import { Dir } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it, vi } from "vitest";
import { createProjectAnalysisResolver } from "../src/project-config.js";

it.each([false, true])(
  "retries discovery with identity-safe rejection eviction (invalidate=%s)",
  async (invalidateBeforeFailure) => {
    const root = await mkdtemp(join(tmpdir(), "birdcc-discovery-retry-"));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let firstOutcome: Promise<unknown> | undefined;
    let started = false;
    let rootScans = 0;
    const failure = new TypeError("unit discovery failure");
    const iterate = Dir.prototype[Symbol.asyncIterator];
    // Unit fault injection at the native iterator; successful retries read real files.
    const injection = vi
      .spyOn(Dir.prototype, Symbol.asyncIterator)
      .mockImplementation(async function* (this: Dir) {
        if (this.path === root) rootScans += 1;
        const fail = this.path === root && rootScans === 1;
        for await (const entry of iterate.call(this)) {
          if (fail) {
            started = true;
            await gate;
            throw failure;
          }
          yield entry;
        }
        return undefined;
      });
    try {
      const main = join(root, "bird.conf");
      const document = join(root, "part.conf");
      await writeFile(main, "router id 192.0.2.1;\nprotocol device {}\n");
      await writeFile(document, "define LOCAL_AS = 65000;\n");
      const resolver = createProjectAnalysisResolver();
      const input = {
        documentUri: pathToFileURL(document).toString(),
        workspaceRootUris: [pathToFileURL(root).toString()],
        defaults: { maxDepth: 16, maxFiles: 256 },
      };
      firstOutcome = resolver.resolve(input).then(
        () => null,
        (error: unknown) => error,
      );
      await vi.waitFor(() => expect(started).toBe(true), { timeout: 10_000 });
      if (invalidateBeforeFailure) {
        resolver.invalidate(pathToFileURL(root).toString());
      } else {
        release();
        expect(await firstOutcome).toBe(failure);
      }
      const results = await Promise.all([
        resolver.resolve(input),
        resolver.resolve(input),
      ]);
      for (const result of results)
        expect(result.entryUri).toBe(pathToFileURL(main).toString());
      if (invalidateBeforeFailure) {
        release();
        expect(await firstOutcome).toBe(failure);
      }
      expect((await resolver.resolve(input)).entryUri).toBe(
        pathToFileURL(main).toString(),
      );
      expect(rootScans).toBe(2);
    } finally {
      release();
      await firstOutcome;
      injection.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  },
  30_000,
);
