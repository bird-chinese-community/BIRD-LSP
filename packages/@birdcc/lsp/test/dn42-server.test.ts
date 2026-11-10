import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, type IncomingMessage } from "node:http";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Duplex } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type Hover,
} from "vscode-languageserver/node.js";
import { afterEach, expect, it, vi } from "vitest";

const fixture = fileURLToPath(
  new URL("../../intel/test/fixtures/", import.meta.url),
);
const files = [
  "DN42-IPDB-Country.mmdb",
  "DN42-IPDB-City.mmdb",
  "DN42-IPDB-ASN.mmdb",
  "DN42-IPDB-Connection-Type.mmdb",
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
const checksums = JSON.stringify(
  Object.fromEntries(
    files.map((file) => [
      file,
      createHash("sha256").update(artifacts[`/${file}`]).digest("hex"),
    ]),
  ),
);
const source =
  'protocol bgp test { neighbor 172.20.0.1 as 4242420001; }\n# 172.20.0.1\n/* local as 4242420001;\nneighbor 172.20.0.1 as 4242420001; */\ndefine LABEL = "local as 4242420001";\nprotocol bgp invalid { neighbor 172.20.0.1 as 4294967296; }\n';
// Tags that vscode-languageclient advertises with markdown.supportHtml.
const htmlTags = ["h3", "p", "br", "table", "tr", "td", "hr", "span"];
const proxyVariables = new Set([
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "NODE_USE_ENV_PROXY",
]);
const directEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !proxyVariables.has(name)),
);

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/**
 * Serves the fixture release. As a proxy it tunnels CONNECT requests to itself
 * and answers absolute-form requests directly.
 */
const serveRelease = async () => {
  const counts = { requests: 0, proxied: 0 };
  const server = createServer((request, response) => {
    counts.requests += 1;
    if (request.url?.startsWith("http://")) counts.proxied += 1;
    const path = new URL(request.url ?? "/", "http://release.invalid").pathname;
    const body = path === "/checksums.json" ? checksums : artifacts[path];
    if (body) response.end(body);
    else {
      response.statusCode = 404;
      response.end();
    }
  });
  server.on("connect", (_request: IncomingMessage, socket: Duplex) => {
    counts.proxied += 1;
    const upstream = connect(port, "127.0.0.1", () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("HTTP fixture did not start");
  const port = address.port;
  cleanups.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { counts, url: `http://127.0.0.1:${port}/` };
};

const startServer = async (options: {
  baseUrl: string;
  env?: NodeJS.ProcessEnv;
  capabilities: object;
  initializationOptions: object;
  configuration: (section: string | undefined) => unknown;
}) => {
  const dir = await mkdtemp(join(tmpdir(), "birdcc-dn42-"));
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL("./fixtures/dn42-server.mjs", import.meta.url)),
      dir,
      options.baseUrl,
      "--stdio",
    ],
    { stdio: ["pipe", "pipe", "pipe"], env: options.env ?? directEnv },
  );
  const exited = once(child, "exit");
  const client = createMessageConnection(
    new StreamMessageReader(child.stdout),
    new StreamMessageWriter(child.stdin),
  );
  let configurationRequests = 0;
  client.onRequest(
    "workspace/configuration",
    (params: { items: { section?: string }[] }) => {
      configurationRequests += 1;
      return params.items.map((item) => options.configuration(item.section));
    },
  );
  client.listen();
  cleanups.push(async () => {
    client.dispose();
    if (child.exitCode === null) child.kill();
    await exited;
    await rm(dir, { recursive: true, force: true });
  });
  const uri = pathToFileURL(join(dir, "bird.conf")).toString();
  await client.sendRequest("initialize", {
    processId: null,
    rootUri: pathToFileURL(dir).toString(),
    capabilities: options.capabilities,
    initializationOptions: options.initializationOptions,
  });
  await client.sendNotification("initialized", {});
  await client.sendNotification("textDocument/didOpen", {
    textDocument: { uri, version: 1, languageId: "bird", text: source },
  });
  /** Returns the Markdown value of a MarkupContent hover, or its JSON. */
  const hover = async (line: number, character: number): Promise<string> => {
    const result = await client.sendRequest<Hover | null>(
      "textDocument/hover",
      { textDocument: { uri }, position: { line, character } },
    );
    const contents = result?.contents;
    return contents &&
      typeof contents === "object" &&
      !Array.isArray(contents) &&
      "kind" in contents &&
      contents.kind === "markdown"
      ? contents.value
      : JSON.stringify(contents ?? null);
  };
  const changeSettings = (settings: object) =>
    client.sendNotification("workspace/didChangeConfiguration", { settings });
  const shutdown = async () => {
    await client.sendRequest("shutdown");
    await client.sendNotification("exit");
    await exited;
  };
  return {
    hover,
    changeSettings,
    shutdown,
    configurationRequests: () => configurationRequests,
  };
};

it("uses DN42 hover only after the user enables it", async () => {
  const release = await serveRelease();
  let userEnabled = false;
  let masterEnabled = true;
  let hoverEnabled = true;
  const { hover, changeSettings, shutdown } = await startServer({
    baseUrl: release.url,
    capabilities: {
      workspace: { configuration: true },
      general: { markdown: { parser: "marked", allowedTags: htmlTags } },
    },
    initializationOptions: { birdcc: {} },
    configuration: (section) =>
      section === "bird2-lsp.intel.dn42.enabled"
        ? userEnabled
        : section === "bird2-lsp.intel.enabled"
          ? masterEnabled
          : section === "bird2-lsp.intel.hover"
            ? hoverEnabled
            : {
                intel: {
                  enabled: masterEnabled,
                  hover: hoverEnabled,
                  dn42: { enabled: true },
                },
              },
  });
  await hover(0, 34);
  expect(release.counts.requests).toBe(0);
  await changeSettings({ birdcc: { intel: { dn42: { enabled: true } } } });
  await hover(0, 34);
  expect(release.counts.requests).toBe(0);
  userEnabled = true;
  await changeSettings({ birdcc: { intel: { dn42: { enabled: true } } } });
  await vi.waitFor(
    async () => expect(await hover(0, 34)).toContain("@birdcc/dn42-ipdb"),
    { timeout: 10000 },
  );
  expect(release.counts.requests).toBeGreaterThanOrEqual(8);

  const ipMarkdown = await hover(0, 34);
  expect(ipMarkdown).toMatch(/^<h3>🇺🇸 172\.20\.0\.1<\/h3>\n/);
  for (const text of [
    "TestNetwork",
    "AS4242420001",
    "Public DNS resolver",
    "Test City, California, United States",
    "Germany",
    "172.20.0.1/32",
    "resolver.test.dn42",
    "codicon-pass-filled",
    "&nbsp;Valid",
    "&nbsp;Exact",
    "Data source: @birdcc/dn42-ipdb, #2023-11-14.1",
    "<table>",
  ])
    expect(ipMarkdown).toContain(text);
  expect(ipMarkdown).not.toContain("network_type");
  expect(ipMarkdown).not.toContain("public-resolver");

  const asnMarkdown = await hover(0, 45);
  expect(asnMarkdown).toMatch(
    /^<h3><span class="codicon codicon-organization"><\/span> AS4242420001<\/h3>\n/,
  );
  for (const text of [
    "TestNetwork",
    "Germany",
    "2 more",
    "Public DNS resolver",
    "Anycast",
    "172.20.0.1",
  ])
    expect(asnMarkdown).toContain(text);
  for (const [line, character] of [
    [5, 48],
    [1, 5],
    [2, 17],
    [3, 45],
    [4, 30],
  ] as const)
    expect(await hover(line, character)).not.toContain("@birdcc/dn42-ipdb");

  hoverEnabled = false;
  await changeSettings({ birdcc: { intel: { hover: false } } });
  await vi.waitFor(async () =>
    expect(await hover(0, 34)).not.toContain("@birdcc/dn42-ipdb"),
  );
  // Turning hover back on restarts the provider, which checks for an update.
  const checked = release.counts.requests;
  hoverEnabled = true;
  await changeSettings({ birdcc: { intel: { hover: true } } });
  await vi.waitFor(async () =>
    expect(await hover(0, 45)).toContain("@birdcc/dn42-ipdb"),
  );
  await vi.waitFor(() =>
    expect(release.counts.requests).toBeGreaterThan(checked),
  );
  masterEnabled = false;
  await changeSettings({ birdcc: { intel: { enabled: false } } });
  await vi.waitFor(async () =>
    expect(await hover(0, 45)).not.toContain("@birdcc/dn42-ipdb"),
  );
  userEnabled = false;
  await changeSettings({ birdcc: { intel: { dn42: { enabled: false } } } });
  await vi.waitFor(async () =>
    expect(await hover(0, 34)).not.toContain("@birdcc/dn42-ipdb"),
  );
  await shutdown();
}, 20000);

it("serves the Markdown form and falls back to initialization options", async () => {
  const release = await serveRelease();
  const session = await startServer({
    baseUrl: release.url,
    capabilities: { workspace: { configuration: true } },
    initializationOptions: { birdcc: { intel: { dn42: { enabled: true } } } },
    configuration: () => null,
  });
  await vi.waitFor(
    async () =>
      expect(await session.hover(0, 34)).toContain("@birdcc/dn42-ipdb"),
    { timeout: 10000 },
  );
  const markdown = await session.hover(0, 34);
  expect(markdown).toMatch(/^### 🇺🇸 `172\.20\.0\.1`\n\n/);
  expect(markdown).not.toContain("<span");

  const answered = session.configurationRequests();
  await session.changeSettings({
    "bird2-lsp": { formatter: { engine: "builtin" } },
  });
  await vi.waitFor(() =>
    expect(session.configurationRequests()).toBeGreaterThan(answered),
  );
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(await session.hover(0, 45)).toContain("@birdcc/dn42-ipdb");
  await session.shutdown();
}, 20000);

it("downloads through the proxy in the server environment", async () => {
  // The release server also acts as the proxy. The SDK accepts plain HTTP only
  // for loopback hosts, so proxied requests are told apart by their form.
  const release = await serveRelease();
  const session = await startServer({
    baseUrl: release.url,
    env: { ...directEnv, HTTP_PROXY: release.url },
    capabilities: { workspace: { configuration: true } },
    initializationOptions: {},
    configuration: (section) =>
      section === "bird2-lsp.intel.dn42.enabled" ? true : null,
  });
  await vi.waitFor(
    async () =>
      expect(await session.hover(0, 34)).toContain("@birdcc/dn42-ipdb"),
    { timeout: 10000 },
  );
  expect(release.counts.proxied).toBeGreaterThan(0);
  await session.shutdown();
}, 20000);
