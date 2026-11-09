import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type Hover,
} from "vscode-languageserver/node.js";
import { expect, it, vi } from "vitest";

it("uses DN42 hover only after user enables it", async () => {
  const fixture = fileURLToPath(
    new URL("../../intel/test/fixtures/", import.meta.url),
  );
  const [city, asn] = await Promise.all([
    readFile(join(fixture, "city.mmdb")),
    readFile(join(fixture, "asn.mmdb")),
  ]);
  const hash = (data: Buffer) =>
    createHash("sha256").update(data).digest("hex");
  const checksums = JSON.stringify({
    "city.mmdb": hash(city),
    "asn.mmdb": hash(asn),
  });
  let requests = 0;
  const server = createServer((req, res) => {
    requests += 1;
    if (req.url === "/checksums.json") res.end(checksums);
    else if (req.url === "/city.mmdb") res.end(city);
    else if (req.url === "/asn.mmdb") res.end(asn);
    else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("HTTP fixture did not start");
  const dir = await mkdtemp(join(tmpdir(), "birdcc-dn42-"));
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL("./fixtures/dn42-server.mjs", import.meta.url)),
      dir,
      `http://127.0.0.1:${address.port}/`,
      "--stdio",
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const exited = once(child, "exit");
  const client = createMessageConnection(
    new StreamMessageReader(child.stdout),
    new StreamMessageWriter(child.stdin),
  );
  let userEnabled = false;
  client.onRequest(
    "workspace/configuration",
    (params: { items: { section?: string; scopeUri?: string }[] }) =>
      params.items.map((item) =>
        item.section === "bird2-lsp.intel.dn42.enabled"
          ? userEnabled
          : item.section === "bird2-lsp.intel.enabled"
            ? true
            : { intel: { dn42: { enabled: true } } },
      ),
  );
  client.listen();
  const uri = pathToFileURL(join(dir, "bird.conf")).toString();
  const source =
    "protocol bgp test { neighbor 172.20.0.1 as 4242420001; }\n# 172.20.0.1\n";
  const hover = (line: number, character: number) =>
    client.sendRequest<Hover | null>("textDocument/hover", {
      textDocument: { uri },
      position: { line, character },
    });
  try {
    await client.sendRequest("initialize", {
      processId: null,
      rootUri: pathToFileURL(dir).toString(),
      capabilities: { workspace: { configuration: true } },
      initializationOptions: { birdcc: {} },
    });
    await client.sendNotification("initialized", {});
    await client.sendNotification("textDocument/didOpen", {
      textDocument: { uri, version: 1, languageId: "bird", text: source },
    });
    await hover(0, 34);
    expect(requests).toBe(0);
    await client.sendNotification("workspace/didChangeConfiguration", {
      settings: { birdcc: { intel: { dn42: { enabled: true } } } },
    });
    await hover(0, 34);
    expect(requests).toBe(0);
    userEnabled = true;
    await client.sendNotification("workspace/didChangeConfiguration", {
      settings: { birdcc: { intel: { dn42: { enabled: true } } } },
    });
    await vi.waitFor(
      async () =>
        expect((await hover(0, 34))?.contents).toMatchObject({
          kind: "plaintext",
          value: expect.stringContaining("DN42 IPDB"),
        }),
      { timeout: 10000 },
    );
    expect(requests).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify((await hover(1, 5))?.contents) ?? "").not.toContain(
      "DN42 IPDB",
    );
    userEnabled = false;
    await client.sendNotification("workspace/didChangeConfiguration", {
      settings: { birdcc: { intel: { dn42: { enabled: false } } } },
    });
    await vi.waitFor(async () =>
      expect(
        JSON.stringify((await hover(0, 34))?.contents) ?? "",
      ).not.toContain("DN42 IPDB"),
    );
    await client.sendRequest("shutdown");
    await client.sendNotification("exit");
  } finally {
    client.dispose();
    if (child.exitCode === null) child.kill();
    await exited;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(dir, { recursive: true, force: true });
  }
}, 20000);
