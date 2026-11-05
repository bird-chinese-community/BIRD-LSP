import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { encode } from "@msgpack/msgpack";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadAsnDatabase } from "../src/database.js";
import { createAsnIntel } from "../src/intel.js";

describe("ASN database boundary", () => {
  let directory: string;
  let dbPath: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "birdcc-asn-database-"));
    dbPath = join(directory, "asn-db.bin.gz");
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("identifies a valid MessagePack database and builds its lookup indices", async () => {
    const bytes = gzipSync(
      encode([
        [1, 2, 0xffff_ffff],
        ["One", "Two", "Reserved"],
        ["", "Content", "Reserved"],
        ["", "US", "ZZ"],
      ]),
    );
    await writeFile(dbPath, bytes);
    const database = loadAsnDatabase({ dbPath });
    expect(database.count).toBe(3);
    expect(database.exactLookup(2)).toEqual({
      asn: 2,
      name: "Two",
      cls: "Content",
      cc: "US",
    });
    expect(database.prefixSearch("4")).toEqual([
      { asn: 0xffff_ffff, name: "Reserved", cls: "Reserved", cc: "ZZ" },
    ]);
    expect(database.version.packageVersion.length).toBeGreaterThan(0);
    expect(database.version.contentSha256).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    expect(createAsnIntel(dbPath).version).toEqual(database.version);
  });

  it("reports a missing database separately from read failures", () => {
    const missing = createAsnIntel(dbPath);
    expect(missing.available).toBe(false);
    expect(missing.failure).toMatchObject({
      code: "missing",
      dbPath,
      version: { packageVersion: expect.any(String) },
    });
    expect(missing.failure?.version.contentSha256).toBeUndefined();
    expect(() => loadAsnDatabase({ dbPath })).toThrowError(
      expect.objectContaining({
        cause: expect.objectContaining({ code: "missing", dbPath }),
      }),
    );
    expect(createAsnIntel(directory).failure?.code).toBe("read");
  });

  it("reports gzip failures with the identity of the file that was read", async () => {
    const bytes = Buffer.from("invalid gzip");
    await writeFile(dbPath, bytes);
    const intel = createAsnIntel(dbPath);
    expect(intel.failure).toMatchObject({
      code: "decompress",
      version: {
        contentSha256: createHash("sha256").update(bytes).digest("hex"),
      },
    });
    expect(intel.exactLookup(1)).toBeUndefined();
    expect(intel.prefixSearch("1")).toEqual([]);
  });

  it("reports invalid MessagePack after successful decompression", async () => {
    await writeFile(dbPath, gzipSync(Buffer.from("invalid MessagePack")));
    expect(createAsnIntel(dbPath).failure?.code).toBe("decode");
  });

  it.each([
    { name: "a map instead of columns", columns: { asns: [1] } },
    { name: "missing columns", columns: [[1], ["one"]] },
    {
      name: "additional columns",
      columns: [[1], ["one"], [""], ["US"], ["extra"]],
    },
    {
      name: "unequal column lengths",
      columns: [[1, 2], ["one"], ["", ""], ["US", "ZZ"]],
    },
    { name: "non-string names", columns: [[1], [42], [""], ["US"]] },
    { name: "non-string classes", columns: [[1], ["one"], [42], ["US"]] },
    { name: "invalid country codes", columns: [[1], ["one"], [""], ["USA"]] },
    { name: "negative ASNs", columns: [[-1], ["one"], [""], ["US"]] },
    { name: "fractional ASNs", columns: [[1.5], ["one"], [""], ["US"]] },
    {
      name: "ASNs outside uint32",
      columns: [[0x1_0000_0000], ["one"], [""], ["US"]],
    },
    {
      name: "duplicate ASNs",
      columns: [
        [1, 1],
        ["one", "other"],
        ["", ""],
        ["US", "ZZ"],
      ],
    },
    {
      name: "unsorted ASNs",
      columns: [
        [2, 1],
        ["two", "one"],
        ["", ""],
        ["US", "ZZ"],
      ],
    },
    { name: "an empty database", columns: [[], [], [], []] },
  ])("rejects $name as a schema failure", async ({ columns }) => {
    await writeFile(dbPath, gzipSync(encode(columns)));
    const intel = createAsnIntel(dbPath);
    expect(intel.available).toBe(false);
    expect(intel.failure).toMatchObject({
      code: "schema",
      dbPath,
      version: {
        packageVersion: expect.any(String),
        contentSha256: expect.any(String),
      },
    });
    expect(intel.failure?.message.length).toBeGreaterThan(0);
    expect(() => loadAsnDatabase({ dbPath })).toThrow(
      /ASN database schema failure/u,
    );
  });
});
