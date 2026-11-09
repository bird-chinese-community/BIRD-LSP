import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDn42Intel } from "../src/dn42.js";

const city = await readFile(new URL("./fixtures/city.mmdb", import.meta.url));
const asn = await readFile(new URL("./fixtures/asn.mmdb", import.meta.url));
const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const checksums = { "city.mmdb": digest(city), "asn.mmdb": digest(asn) };
const temporary: string[] = [];
const servers: Server[] = [];

async function cacheDir(): Promise<string> {
  const root = join(process.cwd(), "node_modules", ".cache", "dn42-tests");
  await mkdir(root, { recursive: true });
  const dir = await mkdtemp(join(root, "cache-"));
  temporary.push(dir);
  return dir;
}

async function serve(
  handler: Parameters<typeof createServer>[0],
): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("missing server address");
  return `http://127.0.0.1:${address.port}/`;
}

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
  await Promise.all(
    temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("DN42 intelligence", () => {
  it.runIf(process.env.DN42_LIVE === "1")(
    "downloads and queries the public release",
    async () => {
      let updated: () => void = () => {};
      const ready = new Promise<void>((resolve) => {
        updated = resolve;
      });
      let failed: (error: Error) => void = () => {};
      const failure = new Promise<never>((_, reject) => {
        failed = reject;
      });
      const intel = createDn42Intel({
        cacheDir: await cacheDir(),
        onUpdate: updated,
        onError: failed,
      });
      try {
        intel.setEnabled(true);
        await Promise.race([ready, failure]);
        expect(intel.lookup("172.23.33.0")).toMatchObject({
          asn: 4242420803,
          country: "CN",
          region: "HB",
          city: "Wuhan",
        });
        expect(intel.lookup("172.20.45.56")).toMatchObject({
          asn: 4242422020,
          country: "TW",
          region: "TNN",
          city: "Tainan",
        });
        expect(intel.lookup("fd9b:7680:aabb:1::1")).toMatchObject({
          asn: 4242422080,
          asName: "HATSNET-AS",
        });
        expect(intel.lookup("172.20.0.53")).toBeUndefined();
      } finally {
        intel.dispose();
      }
    },
    60_000,
  );

  it("loads and verifies a real pair and keeps it on a failed update", async () => {
    let corrupt = false;
    let requests = 0;
    const url = await serve((request, response) => {
      requests++;
      if (request.url === "/checksums.json") {
        response.end(
          JSON.stringify(
            corrupt ? { ...checksums, "city.mmdb": "0".repeat(64) } : checksums,
          ),
        );
      } else if (request.url === "/city.mmdb") response.end(city);
      else if (request.url === "/asn.mmdb") response.end(asn);
      else {
        response.statusCode = 404;
        response.end();
      }
    });
    let updated: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      updated = resolve;
    });
    const errors: Error[] = [];
    const intel = createDn42Intel({
      cacheDir: await cacheDir(),
      baseUrl: url,
      onUpdate: () => updated(),
      onError: (error) => errors.push(error),
    });
    expect(intel.lookup("172.20.0.1")).toBeUndefined();
    expect(requests).toBe(0);
    intel.setEnabled(true);
    await ready;
    expect(intel.lookup("172.20.0.1")).toMatchObject({
      asn: 4242420001,
      asName: "Test Network",
      country: "US",
      region: "CA",
      city: "Test City",
    });
    expect(intel.lookup("fd42:1234::1")).toMatchObject({
      asn: 4242420001,
      city: "Test City",
    });
    expect(intel.lookup("172.21.0.1")).toBeUndefined();
    expect(intel.lookup("172.20.1.1")).toBeUndefined();
    await intel.refresh();
    corrupt = true;
    await expect(intel.refresh()).rejects.toThrow("checksum mismatch");
    expect(errors).toHaveLength(1);
    expect(intel.lookup("172.20.0.1")?.asn).toBe(4242420001);
    intel.setEnabled(false);
    expect(intel.lookup("172.20.0.1")).toBeUndefined();
    intel.dispose();
  });

  it("removes unreferenced cache versions after activating an update", async () => {
    const url = await serve((request, response) => {
      if (request.url === "/checksums.json")
        response.end(JSON.stringify(checksums));
      else if (request.url === "/city.mmdb") response.end(city);
      else response.end(asn);
    });
    const dir = await cacheDir();
    const stale = join(dir, "a".repeat(64));
    await mkdir(stale);
    await writeFile(join(stale, "city.mmdb"), city);
    await writeFile(join(stale, "asn.mmdb"), asn);
    let updated: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      updated = resolve;
    });
    const intel = createDn42Intel({
      cacheDir: dir,
      baseUrl: url,
      onUpdate: () => updated(),
    });
    intel.setEnabled(true);
    await ready;
    await intel.refresh();
    const pointer = JSON.parse(
      await readFile(join(dir, "current.json"), "utf8"),
    ) as { version: string };
    const versions = (await readdir(dir)).filter((name) =>
      /^[0-9a-f]{64}$/.test(name),
    );
    expect(versions).toEqual([pointer.version]);
    intel.dispose();
  });

  it("does not publish an update after disabling during download", async () => {
    let received: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      received = resolve;
    });
    const url = await serve((request, response) => {
      if (request.url === "/checksums.json")
        response.end(JSON.stringify(checksums));
      else {
        received();
        request.on("close", () => response.destroy());
      }
    });
    const dir = await cacheDir();
    let updates = 0;
    const intel = createDn42Intel({
      cacheDir: dir,
      baseUrl: url,
      onUpdate: () => {
        updates++;
      },
    });
    intel.setEnabled(true);
    await started;
    intel.setEnabled(false);
    await expect(readFile(join(dir, "current.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(updates).toBe(0);
    expect(intel.lookup("172.20.0.1")).toBeUndefined();
    intel.dispose();
  });

  it.each(["type", "missing"])(
    "rejects an invalid database pair: %s",
    async (failureKind) => {
      const url = await serve((request, response) => {
        if (request.url === "/checksums.json") {
          response.end(
            JSON.stringify({ ...checksums, "asn.mmdb": digest(city) }),
          );
        } else if (request.url === "/city.mmdb") response.end(city);
        else if (failureKind === "type") response.end(city);
        else {
          response.statusCode = 500;
          response.end();
        }
      });
      const dir = await cacheDir();
      let failed: (error: Error) => void = () => {};
      const failure = new Promise<Error>((resolve) => {
        failed = resolve;
      });
      const intel = createDn42Intel({
        cacheDir: dir,
        baseUrl: url,
        onError: failed,
      });
      intel.setEnabled(true);
      const error = await failure;
      expect(error.message).toMatch(
        failureKind === "type" ? /type mismatch/ : /HTTP 500/,
      );
      await expect(readFile(join(dir, "current.json"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(intel.lookup("172.20.0.1")).toBeUndefined();
      intel.dispose();
    },
  );

  it("retains only the current and previous database versions", async () => {
    const versions = await Promise.all(
      ["city.mmdb", "city-v1.mmdb", "city-v2.mmdb", "city-v3.mmdb"].map(
        (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url)),
      ),
    );
    expect(new Set(versions.map(digest)).size).toBe(4);
    let current = versions[0];
    const url = await serve((request, response) => {
      if (request.url === "/checksums.json")
        response.end(
          JSON.stringify({ ...checksums, "city.mmdb": digest(current) }),
        );
      else if (request.url === "/city.mmdb") response.end(current);
      else response.end(asn);
    });
    const dir = await cacheDir();
    await writeFile(join(dir, "custom.txt"), "preserve");
    await mkdir(join(dir, ".stage-unfinished"));
    const otherDir = "a".repeat(64);
    await mkdir(join(dir, otherDir));
    await writeFile(join(dir, otherDir, "custom.txt"), "preserve");
    let updated: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      updated = resolve;
    });
    const intel = createDn42Intel({
      cacheDir: dir,
      baseUrl: url,
      onUpdate: updated,
    });
    intel.setEnabled(true);
    await ready;
    await intel.refresh();
    let oldReady: () => void = () => {};
    const oldLoaded = new Promise<void>((resolve) => {
      oldReady = resolve;
    });
    const oldIntel = createDn42Intel({
      cacheDir: dir,
      baseUrl: url,
      onUpdate: oldReady,
    });
    oldIntel.setEnabled(true);
    await oldLoaded;
    await oldIntel.refresh();
    const seen = new Set<string>();
    for (let i = 0; i < versions.length; i++) {
      current = versions[i];
      await intel.refresh();
      const pointer = JSON.parse(
        await readFile(join(dir, "current.json"), "utf8"),
      );
      seen.add(pointer.version);
      expect(
        digest(await readFile(join(dir, pointer.version, "city.mmdb"))),
      ).toBe(digest(current));
      expect(intel.lookup("172.20.0.1")?.asn).toBe(4242420001);
      expect(oldIntel.lookup("172.20.0.1")?.asn).toBe(4242420001);
      const entries = await readdir(dir, { withFileTypes: true });
      const databaseDirs = entries.filter(
        (entry) =>
          entry.isDirectory() &&
          /^[0-9a-f]{64}$/.test(entry.name) &&
          entry.name !== otherDir,
      );
      expect(databaseDirs.length).toBeLessThanOrEqual(2);
    }
    expect(seen.size).toBe(4);
    expect(await readFile(join(dir, "custom.txt"), "utf8")).toBe("preserve");
    expect(await readFile(join(dir, otherDir, "custom.txt"), "utf8")).toBe(
      "preserve",
    );
    expect(await readdir(join(dir, ".stage-unfinished"))).toEqual([]);
    oldIntel.dispose();
    intel.dispose();
  });

  it("does not start a second download while the cache is locked", async () => {
    let received: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      received = resolve;
    });
    let requests = 0;
    let stall = false;
    const url = await serve((request, response) => {
      requests++;
      if (stall) {
        received();
        request.on("close", () => response.destroy());
      } else if (request.url === "/checksums.json")
        response.end(JSON.stringify(checksums));
      else if (request.url === "/city.mmdb") response.end(city);
      else response.end(asn);
    });
    const dir = await cacheDir();
    let updated: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      updated = resolve;
    });
    const first = createDn42Intel({
      cacheDir: dir,
      baseUrl: url,
      onUpdate: updated,
    });
    first.setEnabled(true);
    await ready;
    await first.refresh();
    let secondUpdated: () => void = () => {};
    const secondReady = new Promise<void>((resolve) => {
      secondUpdated = resolve;
    });
    const errors: Error[] = [];
    const second = createDn42Intel({
      cacheDir: dir,
      baseUrl: url,
      onUpdate: secondUpdated,
      onError: (error) => errors.push(error),
    });
    second.setEnabled(true);
    await secondReady;
    await second.refresh();
    stall = true;
    const pending = first.refresh();
    await started;
    const requestsBefore = requests;
    await expect(second.refresh()).rejects.toThrow(/lock/i);
    expect(errors).toHaveLength(1);
    expect(requests).toBe(requestsBefore);
    expect(second.lookup("172.20.0.1")?.asn).toBe(4242420001);
    first.dispose();
    await pending;
    stall = false;
    await second.refresh();
    expect(second.lookup("fd42:1234::1")?.asn).toBe(4242420001);
    second.dispose();
  });
});
