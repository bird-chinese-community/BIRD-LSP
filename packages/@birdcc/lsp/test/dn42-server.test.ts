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
import { decodeHTML } from "entities";

it("uses DN42 hover only after user enables it", async () => {
  const fixture = fileURLToPath(
    new URL("../../intel/test/fixtures/", import.meta.url),
  );
  const files = [
    "country.mmdb",
    "city.mmdb",
    "asn.mmdb",
    "connection-type.mmdb",
    "asn-index.json",
    "metadata.json",
    "LICENSE-Unicode.txt",
  ];
  const artifacts = Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        `/${file}`,
        await readFile(join(fixture, file)),
      ]),
    ),
  );
  const hash = (data: Buffer) =>
    createHash("sha256").update(data).digest("hex");
  const checksums = JSON.stringify(
    Object.fromEntries(
      files.map((file) => [file, hash(artifacts[`/${file}`])]),
    ),
  );
  let requests = 0;
  const server = createServer((req, res) => {
    requests += 1;
    if (req.url === "/checksums.json") res.end(checksums);
    else if (artifacts[req.url ?? ""]) res.end(artifacts[req.url ?? ""]);
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
  let masterEnabled = true;
  let hoverEnabled = true;
  client.onRequest(
    "workspace/configuration",
    (params: { items: { section?: string; scopeUri?: string }[] }) =>
      params.items.map((item) =>
        item.section === "bird2-lsp.intel.dn42.enabled"
          ? userEnabled
          : item.section === "bird2-lsp.intel.enabled"
            ? masterEnabled
            : {
                intel: {
                  enabled: masterEnabled,
                  hover: hoverEnabled,
                  dn42: { enabled: true },
                },
              },
      ),
  );
  client.listen();
  const uri = pathToFileURL(join(dir, "bird.conf")).toString();
  const source =
    'protocol bgp test { neighbor 172.20.0.1 as 4242420001; }\n# 172.20.0.1\n/* local as 4242420001;\nneighbor 172.20.0.1 as 4242420001; */\ndefine LABEL = "local as 4242420001";\nprotocol bgp invalid { neighbor 172.20.0.1 as 4294967296; }\n';
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
          kind: "markdown",
          value: expect.stringContaining("DN42 IPDB"),
        }),
      { timeout: 10000 },
    );
    expect(requests).toBeGreaterThanOrEqual(8);
    const ipHover = (await hover(0, 34))?.contents;
    if (
      !ipHover ||
      typeof ipHover !== "object" ||
      Array.isArray(ipHover) ||
      !("kind" in ipHover)
    )
      throw new Error("DN42 hover must contain MarkupContent");
    expect(ipHover.kind).toBe("markdown");
    const ipMarkdown = decodeHTML(ipHover.value);
    expect(ipMarkdown).toMatch(/^### 172\.20\.0\.1\n/);
    for (const text of [
      "AS4242420001",
      "TestNetwork",
      "Network 172.20.0.1/32",
      "California, United States",
      "Registered in Germany",
      "**Public DNS resolver** · Anycast `Published`",
      "PTR: resolver.test.dn42",
      "*Source: DN42 IPDB*",
      "ROA `✓ Valid`",
      "*DN42 registry*  \nROA `✓ Valid`",
      "IRR `✓ Exact`",
    ])
      expect(ipMarkdown).toContain(text);
    expect(ipMarkdown).not.toContain("network_type");
    expect(ipMarkdown).not.toContain("public-resolver");
    const asnHover = (await hover(0, 45))?.contents;
    if (
      !asnHover ||
      typeof asnHover !== "object" ||
      Array.isArray(asnHover) ||
      !("kind" in asnHover)
    )
      throw new Error("DN42 ASN hover must contain MarkupContent");
    expect(asnHover.kind).toBe("markdown");
    const asnMarkdown = decodeHTML(asnHover.value);
    expect(asnMarkdown).toMatch(/^### AS4242420001\n/);
    expect(asnMarkdown).toContain("TestNetwork");
    expect(asnMarkdown).toContain("Registered in Germany");
    expect(asnMarkdown).toContain("**4 prefixes**");
    expect(asnMarkdown).toContain("**Member observations**");
    expect(asnMarkdown).toContain(
      "- Public DNS resolver `Observed` · 172.20.0.1",
    );
    expect(asnMarkdown).toContain("- Anycast `Published` · 172.20.0.1");
    expect(asnMarkdown).toContain("**Member policy** · *DN42 registry*");
    expect(JSON.stringify(await hover(5, 48))).not.toContain("DN42 IPDB");
    expect(JSON.stringify((await hover(1, 5))?.contents) ?? "").not.toContain(
      "DN42 IPDB",
    );
    for (const position of [
      [2, 17],
      [3, 45],
      [4, 30],
    ]) {
      expect(
        JSON.stringify((await hover(position[0], position[1]))?.contents) ?? "",
      ).not.toContain("DN42 IPDB");
    }
    hoverEnabled = false;
    await client.sendNotification("workspace/didChangeConfiguration", {
      settings: { birdcc: { intel: { hover: false } } },
    });
    await vi.waitFor(async () =>
      expect(
        JSON.stringify((await hover(0, 34))?.contents) ?? "",
      ).not.toContain("DN42 IPDB"),
    );
    hoverEnabled = true;
    await client.sendNotification("workspace/didChangeConfiguration", {
      settings: { birdcc: { intel: { hover: true } } },
    });
    await vi.waitFor(async () =>
      expect(JSON.stringify((await hover(0, 45))?.contents) ?? "").toContain(
        "DN42 IPDB",
      ),
    );
    masterEnabled = false;
    await client.sendNotification("workspace/didChangeConfiguration", {
      settings: { birdcc: { intel: { enabled: false } } },
    });
    await vi.waitFor(async () =>
      expect(
        JSON.stringify((await hover(0, 45))?.contents) ?? "",
      ).not.toContain("DN42 IPDB"),
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
