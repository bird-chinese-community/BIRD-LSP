import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDn42Intel } from "../src/dn42.js";

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
      await readFile(new URL(`./fixtures/${file}`, import.meta.url)),
    ]),
  ),
);
const checksums = Object.fromEntries(
  files.map((file) => [
    file,
    createHash("sha256").update(artifacts[`/${file}`]).digest("hex"),
  ]),
);
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
    throw new Error("HTTP fixture did not start");
  return `http://127.0.0.1:${address.port}/`;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => {
      server.closeAllConnections();
      return new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }),
  );
  await Promise.all(
    temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("DN42 SDK provider", () => {
  it("loads seven verified artifacts and provides IP and ASN evidence", async () => {
    let requests = 0;
    let corrupt = false;
    const baseUrl = await serve((request, response) => {
      requests++;
      if (request.url === "/checksums.json")
        response.end(
          JSON.stringify(
            corrupt
              ? { ...checksums, "DN42-IPDB-City.mmdb": "0".repeat(64) }
              : checksums,
          ),
        );
      else response.end(artifacts[request.url ?? ""]);
    });
    const errors: Error[] = [];
    const dir = await cacheDir();
    const intel = createDn42Intel({
      cacheDir: dir,
      baseUrl,
      onError: (error) => errors.push(error),
    });
    try {
      await intel.refresh();
      expect(requests).toBe(0);
      expect(intel.lookupAsn(4242420001)).toBeUndefined();
      intel.setEnabled(true);
      await intel.refresh();
      expect(requests).toBe(8);
      expect(intel.lookup("172.20.0.1")).toMatchObject({
        ip: "172.20.0.1",
        asn: 4242420001,
        asName: "TestNetwork",
        country: "US",
        countryName: "United States",
        region: "CA",
        regionName: "California",
        city: "Test City",
        prefix: "172.20.0.1/32",
        dn42: {
          anycast: "published",
          network_types: ["anycast", "public-resolver"],
          ptr: ["resolver.test.dn42"],
          roa_status: "valid",
          irr_status: "exact",
        },
      });
      expect(intel.lookup("fd42:1234::1")?.asn).toBe(4242420001);
      expect(intel.lookup("203.0.113.1")).toBeUndefined();
      expect(intel.lookup("not-an-ip")).toBeUndefined();
      expect(intel.lookupAsn(4242420001)).toMatchObject({
        as_name: "TestNetwork",
        registered_countries: [{ names: { en: "Germany" } }],
        observed_network_types: ["anycast", "public-resolver"],
      });
      expect(intel.lookupAsn(4242420002)).toBeUndefined();
      for (const invalid of [
        -1,
        0,
        4_294_967_296,
        Number.MAX_SAFE_INTEGER,
        NaN,
      ])
        expect(intel.lookupAsn(invalid)).toBeUndefined();
      await intel.refresh();
      expect(requests).toBe(9);
      const cached = createDn42Intel({ cacheDir: dir, baseUrl });
      try {
        cached.setEnabled(true);
        await cached.refresh();
        expect(requests).toBe(10);
        expect(cached.lookup("172.20.0.1")?.asn).toBe(4242420001);
      } finally {
        cached.dispose();
      }
      corrupt = true;
      await expect(intel.refresh()).rejects.toThrow(/Checksum mismatch/);
      expect(errors).toHaveLength(1);
      expect(intel.lookup("172.20.0.1")?.asn).toBe(4242420001);
      const pointer = JSON.parse(
        await readFile(join(dir, "typescript", "v2", "current.json"), "utf8"),
      ) as { version: string };
      expect(
        await readFile(
          join(dir, "typescript", "v2", pointer.version, "LICENSE-Unicode.txt"),
          "utf8",
        ),
      ).toContain("UNICODE");
      intel.setEnabled(false);
      expect(intel.lookup("172.20.0.1")).toBeUndefined();
      expect(intel.lookupAsn(4242420001)).toBeUndefined();
    } finally {
      intel.dispose();
    }
  });

  it("cancels a download and leaves no stale generation data", async () => {
    let received: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      received = resolve;
    });
    const baseUrl = await serve((request, response) => {
      if (request.url === "/checksums.json")
        response.end(JSON.stringify(checksums));
      else {
        received();
        request.on("close", () => response.destroy());
      }
    });
    const dir = await cacheDir();
    const errors: Error[] = [];
    const intel = createDn42Intel({
      cacheDir: dir,
      baseUrl,
      onError: (error) => errors.push(error),
    });
    intel.setEnabled(true);
    const pending = intel.refresh();
    await started;
    intel.setEnabled(false);
    await pending;
    expect(errors).toHaveLength(0);
    expect(intel.lookup("172.20.0.1")).toBeUndefined();
    await expect(
      readFile(join(dir, "typescript", "v2", "current.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(
      (await readdir(join(dir, "typescript", "v2"))).filter((name) =>
        name.startsWith(".stage-"),
      ),
    ).toEqual([]);
    intel.dispose();
  });

  it("keeps loaded readers while another provider holds the update lock", async () => {
    let received: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      received = resolve;
    });
    let stall = false;
    let requests = 0;
    const baseUrl = await serve((request, response) => {
      requests++;
      if (stall) {
        received();
        request.on("close", () => response.destroy());
      } else if (request.url === "/checksums.json")
        response.end(JSON.stringify(checksums));
      else response.end(artifacts[request.url ?? ""]);
    });
    const dir = await cacheDir();
    const first = createDn42Intel({ cacheDir: dir, baseUrl });
    const second = createDn42Intel({ cacheDir: dir, baseUrl });
    try {
      first.setEnabled(true);
      await first.refresh();
      second.setEnabled(true);
      await second.refresh();
      stall = true;
      const pending = first.refresh();
      await started;
      const before = requests;
      await expect(second.refresh()).rejects.toThrow(/lock/i);
      expect(requests).toBe(before);
      expect(second.lookup("172.20.0.1")?.asn).toBe(4242420001);
      first.setEnabled(false);
      await pending;
      stall = false;
      await second.refresh();
    } finally {
      first.dispose();
      second.dispose();
    }
  });

  it.runIf(process.env.DN42_LIVE === "1")(
    "queries the published GeoIP2 bundle",
    async () => {
      const intel = createDn42Intel({ cacheDir: await cacheDir() });
      try {
        intel.setEnabled(true);
        await intel.refresh();
        expect(intel.lookup("172.23.33.0")).toMatchObject({
          asn: 4242420803,
          country: "CN",
          region: "HB",
          city: "Wuhan",
        });
        expect(intel.lookup("172.20.0.53")?.dn42).toMatchObject({
          anycast: "published",
          network_types: expect.arrayContaining(["anycast", "public-resolver"]),
        });
        expect(intel.lookupAsn(4242420803)?.prefixes.length).toBeGreaterThan(0);
      } finally {
        intel.dispose();
      }
    },
    60_000,
  );
});
