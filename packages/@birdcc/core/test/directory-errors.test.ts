import { Dir } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { constants, tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { collectCandidateFiles } from "../src/detection/collector.js";

const injectDirectoryFault = (
  path: string,
  error: Error,
  phase: "read" | "close",
) => {
  const iterate = Dir.prototype[Symbol.asyncIterator];
  let injected = false;
  // Unit fault injection: entries and handle cleanup use the native iterator.
  return vi
    .spyOn(Dir.prototype, Symbol.asyncIterator)
    .mockImplementation(async function* (this: Dir) {
      const fail = this.path === path && !injected;
      if (fail) injected = true;
      for await (const entry of iterate.call(this)) {
        yield entry;
        if (fail && phase === "read") throw error;
      }
      if (fail && phase === "close") throw error;
      return undefined;
    });
};

it.each(["read", "close"] as const)(
  "keeps native directory results after unit %s fault injection",
  async (phase) => {
    const root = await mkdtemp(join(tmpdir(), "birdcc-directory-errors-"));
    try {
      const damaged = join(root, "damaged");
      const healthy = join(root, "healthy");
      await mkdir(damaged);
      await mkdir(healthy);
      await writeFile(join(damaged, "one.conf"), "router id 192.0.2.1;\n");
      await writeFile(join(damaged, "two.conf"), "router id 192.0.2.2;\n");
      await writeFile(join(healthy, "bird.conf"), "router id 192.0.2.3;\n");
      const fault = Object.assign(new Error(`unit ${phase} failure`), {
        code: "EIO",
        errno: -constants.errno.EIO,
      });
      const injection = injectDirectoryFault(damaged, fault, phase);
      try {
        const result = await collectCandidateFiles(root);
        expect(result.files).toContainEqual(
          expect.objectContaining({ relativePath: "healthy/bird.conf" }),
        );
        expect(
          result.files.filter((item) =>
            item.relativePath.startsWith("damaged/"),
          ),
        ).toHaveLength(phase === "read" ? 1 : 2);
        expect(result.warnings).toContainEqual({
          code: "detection/directory-read-failed",
          message: `Failed to read directory entries (EIO): unit ${phase} failure`,
          path: damaged,
        });
      } finally {
        injection.mockRestore();
      }
      const complete = await collectCandidateFiles(root);
      expect(complete.files).toHaveLength(3);
      expect(complete.warnings).toEqual([]);
      const bounded = await collectCandidateFiles(root, { maxFiles: 1 });
      expect(bounded.files).toHaveLength(1);
      expect(bounded.truncated).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

it("propagates unexpected directory iterator errors unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "birdcc-directory-program-error-"));
  try {
    await writeFile(join(root, "bird.conf"), "router id 192.0.2.1;\n");
    const error = new TypeError("unit iterator programming error");
    const injection = injectDirectoryFault(root, error, "read");
    try {
      await expect(collectCandidateFiles(root)).rejects.toBe(error);
    } finally {
      injection.mockRestore();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
