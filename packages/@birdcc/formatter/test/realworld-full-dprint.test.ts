import { delimiter, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { BirdFormatResult } from "../src/index.js";

import { collectBirdConfigCandidatesFromRoots } from "../../../../tools/realworld-config-files.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../../");
const additionalRoots = (process.env.BIRDCC_PRIVATE_CONFIG_EXAMPLE_ROOTS ?? "")
  .split(delimiter)
  .map((value) => value.trim())
  .filter((value) => value.length > 0);
const examplesRoots = [
  resolve(repoRoot, "refer/config-examples"),
  ...additionalRoots,
];
const candidates = await collectBirdConfigCandidatesFromRoots({
  roots: examplesRoots,
  maxBytes: Number.MAX_SAFE_INTEGER,
});
candidates.sort((left, right) => left.path.localeCompare(right.path));

type WorkerReply =
  | { ok: true; result: BirdFormatResult }
  | { ok: false; error: Error };

describe("real-world config examples (full dprint formatter)", () => {
  let worker: Worker | undefined;
  let workerFailure: Error | undefined;
  let stopping = false;
  let pending:
    | {
        resolve: (result: BirdFormatResult) => void;
        reject: (error: Error) => void;
      }
    | undefined;

  const failWorker = (error: Error): void => {
    workerFailure ??= error;
    const request = pending;
    pending = undefined;
    request?.reject(workerFailure);
  };

  const stopWorker = async (): Promise<void> => {
    stopping = true;
    await worker?.terminate();
  };

  beforeAll(() => {
    worker = new Worker(
      new URL("./fixtures/full-dprint-worker.mjs", import.meta.url),
    );
    worker.on("message", (reply: WorkerReply) => {
      const request = pending;
      pending = undefined;
      if (!request) {
        failWorker(
          new Error("Formatter worker replied without an active request"),
        );
        return;
      }
      if (reply.ok) request.resolve(reply.result);
      else request.reject(reply.error);
    });
    worker.on("error", failWorker);
    worker.on("exit", (code) => {
      if (!stopping) {
        failWorker(
          new Error(`Formatter worker exited unexpectedly with status ${code}`),
        );
      }
    });
  });

  afterEach(async () => {
    if (pending) {
      failWorker(
        new Error(
          "Formatter worker request did not finish before test cleanup",
        ),
      );
      await stopWorker();
    }
  });

  afterAll(async () => {
    await stopWorker();
    if (workerFailure) throw workerFailure;
  });

  const formatInWorker = (filePath: string): Promise<BirdFormatResult> =>
    new Promise((resolve, reject) => {
      if (workerFailure) {
        reject(workerFailure);
        return;
      }
      if (!worker || pending) {
        reject(
          new Error("Formatter worker requires one active request at a time"),
        );
        return;
      }
      pending = { resolve, reject };
      worker.postMessage(filePath);
    });

  it("discovers config examples", () => {
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("rejects file read errors from the formatter worker", async () => {
    await expect(
      formatInWorker(
        resolve(here, "realworld-full-dprint.test.ts", "missing.conf"),
      ),
    ).rejects.toThrow(/ENOENT|ENOTDIR/u);
  });

  it.each(
    candidates.map((file) => [relative(repoRoot, file.path), file] as const),
  )(
    "formats %s with dprint engine",
    async (_, file) => {
      await expect(formatInWorker(file.path), file.path).resolves.toMatchObject(
        {
          engine: "dprint",
          text: expect.stringMatching(/\n$/u),
        },
      );
    },
    90_000,
  );
});
