import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { createServerProcess } from "../src/client/server-process.js";

describe("owned language server process", () => {
  it.skipIf(process.platform === "win32")(
    "escalates shutdown when a real child ignores SIGTERM",
    async () => {
      const owner = createServerProcess(process.execPath, [
        "-e",
        "process.on('SIGTERM', () => {}); process.stdout.write('ready'); process.stdin.resume();",
      ]);
      const child = await owner.start();
      try {
        await once(child.stdout, "data");
        await owner.terminate();
        expect(child.signalCode).toBe("SIGKILL");
      } finally {
        await owner.terminate();
      }
    },
  );
});
