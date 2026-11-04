import { readFile } from "node:fs/promises";
import { parentPort } from "node:worker_threads";
import { formatBirdConfig } from "@birdcc/formatter";

if (!parentPort)
  throw new Error("Full dprint integration requires a worker thread");
const port = parentPort;

port.on("message", async (filePath) => {
  try {
    const text = await readFile(filePath, "utf8");
    const result = await formatBirdConfig(text, {
      engine: "dprint",
      safeMode: false,
    });
    port.postMessage({ ok: true, result });
  } catch (error) {
    port.postMessage({
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
    });
  }
});
