import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createDn42Intel } from "../src/dn42.js";

type Release = Record<string, Buffer>;

const fixture = async (file: string): Promise<Buffer> =>
  readFile(new URL(`./fixtures/${file}`, import.meta.url));
const metadata = JSON.parse((await fixture("metadata.json")).toString()) as {
  built_at: string;
  database_types: Record<string, string>;
};
const asnIndex = JSON.parse((await fixture("asn-index.json")).toString()) as {
  asns: Record<string, { as_name: string }>;
};
const files = [
  ...Object.keys(metadata.database_types),
  "asn-index.json",
  "metadata.json",
  "LICENSE-Unicode.txt",
];
const base: Release = Object.fromEntries(
  await Promise.all(files.map(async (file) => [file, await fixture(file)])),
);
const json = (value: unknown): Buffer => Buffer.from(JSON.stringify(value));
const release = (name: string, builtAt: string): Release => ({
  ...base,
  "asn-index.json": json({
    ...asnIndex,
    asns: {
      ...asnIndex.asns,
      "4242420001": { ...asnIndex.asns["4242420001"], as_name: name },
    },
  }),
  "metadata.json": json({ ...metadata, built_at: builtAt }),
});

const temporary: string[] = [];
const servers: Server[] = [];

const cacheDir = async (): Promise<string> => {
  const root = join(process.cwd(), "node_modules", ".cache", "dn42-tests");
  await mkdir(root, { recursive: true });
  const dir = await mkdtemp(join(root, "update-"));
  temporary.push(dir);
  return dir;
};

const serve = async (current: () => Release, delayMs = 0): Promise<string> => {
  const server = createServer(async (request, response) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    const artifacts = current();
    const name = request.url?.slice(1) ?? "";
    const body =
      name === "checksums.json"
        ? json(
            Object.fromEntries(
              Object.entries(artifacts).map(([file, data]) => [
                file,
                createHash("sha256").update(data).digest("hex"),
              ]),
            ),
          )
        : artifacts[name];
    if (body) response.end(body);
    else {
      response.statusCode = 404;
      response.end();
    }
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("HTTP fixture did not start");
  return `http://127.0.0.1:${address.port}/`;
};

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => {
      server.closeAllConnections();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    }),
  );
  await Promise.all(
    temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

it("loads a release that another provider activated in the shared cache", async () => {
  let current = release("Version-1", "2026-11-10T00:00:00Z");
  const baseUrl = await serve(() => current);
  const dir = await cacheDir();
  const errors: Error[] = [];
  const first = createDn42Intel({
    cacheDir: dir,
    baseUrl,
    onError: (error) => errors.push(error),
  });
  const second = createDn42Intel({
    cacheDir: dir,
    baseUrl,
    onError: (error) => errors.push(error),
  });
  const name = (intel: typeof first) => intel.lookupAsn(4242420001)?.as_name;
  try {
    first.setEnabled(true);
    await first.refresh();
    second.setEnabled(true);
    await second.refresh();
    expect([name(first), name(second)]).toEqual(["Version-1", "Version-1"]);

    current = release("Version-2", "2026-11-11T00:00:00Z");
    await first.refresh();
    await second.refresh();
    expect([name(first), name(second)]).toEqual(["Version-2", "Version-2"]);
    expect(errors).toEqual([]);
  } finally {
    first.dispose();
    second.dispose();
  }
});

it("waits for its aborted task to release the cache lock after re-enabling", async () => {
  // A large artifact keeps checksum verification, which holds the lock, busy.
  const current = {
    ...release("Version-1", "2026-11-10T00:00:00Z"),
    "LICENSE-Unicode.txt": Buffer.alloc(24 * 1024 * 1024, 0x20),
  };
  const baseUrl = await serve(() => current);
  const errors: Error[] = [];
  const intel = createDn42Intel({
    cacheDir: await cacheDir(),
    baseUrl,
    onError: (error) => errors.push(error),
  });
  try {
    intel.setEnabled(true);
    await intel.refresh();
    intel.setEnabled(false);
    intel.setEnabled(true);
    await new Promise((resolve) => setTimeout(resolve, 5));
    intel.setEnabled(false);
    intel.setEnabled(true);
    await intel.refresh();
    expect(errors).toEqual([]);
    expect(intel.lookupAsn(4242420001)?.as_name).toBe("Version-1");
  } finally {
    intel.dispose();
  }
});

it("waits quietly while another provider holds the cache lock", async () => {
  const current = release("Version-1", "2026-11-10T00:00:00Z");
  const baseUrl = await serve(() => current, 200);
  const dir = await cacheDir();
  const errors: Error[] = [];
  const first = createDn42Intel({
    cacheDir: dir,
    baseUrl,
    onError: (error) => errors.push(error),
  });
  const second = createDn42Intel({
    cacheDir: dir,
    baseUrl,
    onError: (error) => errors.push(error),
  });
  try {
    first.setEnabled(true);
    const download = first.refresh();
    await new Promise((resolve) => setTimeout(resolve, 100));
    second.setEnabled(true);
    await second.refresh();
    expect(second.lookupAsn(4242420001)).toBeUndefined();
    await download;
    await vi.waitFor(
      () => expect(second.lookupAsn(4242420001)?.as_name).toBe("Version-1"),
      { timeout: 6000, interval: 100 },
    );
    expect(errors).toEqual([]);
  } finally {
    first.dispose();
    second.dispose();
  }
}, 15000);

it("doubles the retry interval after consecutive failures up to one day", async () => {
  const spy = vi.spyOn(globalThis, "setTimeout");
  const intel = createDn42Intel({
    cacheDir: await cacheDir(),
    baseUrl: "http://127.0.0.1:1/",
    onError: () => {},
  });
  try {
    intel.setEnabled(true);
    for (let attempt = 0; attempt < 7; attempt++)
      await intel.refresh().catch(() => {});
    const hour = 60 * 60 * 1000;
    expect(
      spy.mock.calls
        .map(([, delay]) => delay)
        .filter((delay) => typeof delay === "number" && delay >= hour),
    ).toEqual([1, 2, 4, 8, 16, 24, 24].map((hours) => hours * hour));
  } finally {
    spy.mockRestore();
    intel.dispose();
  }
});
