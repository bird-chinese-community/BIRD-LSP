import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bench, do_not_optimize, group, run } from "mitata";
import { createDn42Intel } from "../packages/@birdcc/intel/dist/index.js";
import {
  findIpLiteralAt,
  parseBirdConfig,
} from "../packages/@birdcc/parser/dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
assert.equal(typeof globalThis.gc, "function", "Run Node with --expose-gc");
const mitataPackage = JSON.parse(
  await readFile(join(root, "node_modules/mitata/package.json"), "utf8"),
);
const externalData = process.env.DN42_BENCH_DB_DIR;
const dataDir = externalData
  ? resolve(externalData)
  : join(root, "packages/@birdcc/intel/test/fixtures");
const city = await readFile(join(dataDir, "city.mmdb"));
const asn = await readFile(join(dataDir, "asn.mmdb"));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const checksums = { "city.mmdb": digest(city), "asn.mmdb": digest(asn) };
const manifest = JSON.stringify(checksums);
const addresses = externalData
  ? { ipv4: "172.23.33.0", ipv6: "fd9b:7680:aabb:1::1" }
  : { ipv4: "172.20.0.1", ipv6: "fd42:1234::1" };
const expected = externalData
  ? { ipv4: 4242420803, ipv6: 4242422080 }
  : { ipv4: 4242420001, ipv6: 4242420001 };
const cacheRoot = join(root, "node_modules/.cache/dn42-bench");
await mkdir(cacheRoot, { recursive: true });
const directory = await mkdtemp(join(cacheRoot, "run-"));
let requests = 0;
let databaseRequests = 0;
let sink;
const server = createServer((request, response) => {
  requests++;
  if (request.url === "/checksums.json") response.end(manifest);
  else if (request.url === "/city.mmdb") {
    databaseRequests++;
    response.end(city);
  } else if (request.url === "/asn.mmdb") {
    databaseRequests++;
    response.end(asn);
  } else {
    response.writeHead(404).end();
  }
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
assert(address && typeof address !== "string");
const baseUrl = `http://127.0.0.1:${address.port}/`;
const cacheDir = join(directory, "warm");
const warm = createDn42Intel({ cacheDir, baseUrl });
const disabled = createDn42Intel({ cacheDir, baseUrl });
const inputs = [];

try {
  warm.setEnabled(true);
  await warm.refresh();
  assert.equal(warm.lookup(addresses.ipv4)?.asn, expected.ipv4);
  assert.equal(warm.lookup(addresses.ipv6)?.asn, expected.ipv6);
  assert.equal(warm.lookup("203.0.113.7"), undefined);
  assert.equal(warm.lookup("not-an-ip"), undefined);
  assert.equal(disabled.lookup(addresses.ipv4), undefined);
  assert.equal(databaseRequests, 2);
  const beforeDisabled = requests;
  await disabled.refresh();
  assert.equal(requests, beforeDisabled);
  await warm.refresh();
  assert.equal(databaseRequests, 2);
  const cached = createDn42Intel({ cacheDir, baseUrl });
  try {
    cached.setEnabled(true);
    await cached.refresh();
    assert.equal(cached.lookup(addresses.ipv4)?.asn, expected.ipv4);
    assert.equal(databaseRequests, 2);
  } finally {
    cached.dispose();
  }

  group("Local lookup (loaded readers)", () => {
    for (const [label, provider, ip] of [
      ["disabled control", disabled, addresses.ipv4],
      ["IPv4 hit", warm, addresses.ipv4],
      ["IPv6 hit", warm, addresses.ipv6],
      ["IPv4 miss", warm, "203.0.113.7"],
      ["invalid address", warm, "not-an-ip"],
    ]) {
      bench(`lookup / ${label}`, function* () {
        yield {
          0: () => ip,
          bench(value) {
            sink = provider.lookup(value);
            return do_not_optimize(sink);
          },
        };
      });
    }
  });

  for (const count of [10, 1_000, 10_000]) {
    const prefix = Array.from(
      { length: count },
      (_, index) => `define VALUE_${index} = ${index};`,
    ).join("\n");
    const tail = `define LABEL = "😀"; define PEER = ${addresses.ipv4};`;
    const input = `${prefix}\n${tail}\n# ${addresses.ipv4}\n`;
    const hit = { line: count, character: tail.indexOf(addresses.ipv4) + 2 };
    const comment = { line: count + 1, character: 4 };
    const miss = { line: count, character: 2 };
    assert.equal((await findIpLiteralAt(input, hit))?.value, addresses.ipv4);
    assert.equal(await findIpLiteralAt(input, comment), null);
    assert.equal(await findIpLiteralAt(input, miss), null);
    const parsed = await parseBirdConfig(input);
    assert.equal(parsed.issues.length, 0);
    inputs.push({ declarations: count, bytes: Buffer.byteLength(input) });
    group(`Parser / ${count} declarations`, () => {
      bench(`parser / ${count} / full parse control`, async () => {
        sink = await parseBirdConfig(input);
        return do_not_optimize(sink);
      });
      for (const [label, position] of [
        ["IP after Unicode", hit],
        ["comment", comment],
        ["non-IP token", miss],
      ]) {
        bench(`parser / ${count} / ${label}`, async () => {
          sink = await findIpLiteralAt(input, position);
          return do_not_optimize(sink);
        });
      }
    });
  }

  group("Updater (loopback HTTP and warm filesystem cache)", () => {
    bench("updater / unchanged manifest", async () => {
      await warm.refresh();
    });
    bench("updater / existing cache startup and manifest", async () => {
      const instance = createDn42Intel({ cacheDir, baseUrl });
      try {
        instance.setEnabled(true);
        await instance.refresh();
        sink = instance.lookup(addresses.ipv4);
        assert.equal(sink?.asn, expected.ipv4);
        return do_not_optimize(sink);
      } finally {
        instance.dispose();
      }
    });
    bench("updater / first install including directory cleanup", async () => {
      const freshDir = await mkdtemp(join(directory, "install-"));
      const instance = createDn42Intel({ cacheDir: freshDir, baseUrl });
      try {
        instance.setEnabled(true);
        await instance.refresh();
        sink = instance.lookup(addresses.ipv4);
        assert.equal(sink?.asn, expected.ipv4);
        return do_not_optimize(sink);
      } finally {
        instance.dispose();
        await rm(freshDir, { recursive: true });
      }
    });
  });

  const result = await run({
    format: "quiet",
    throw: true,
    filter: new RegExp(process.env.DN42_BENCH_FILTER ?? ".*"),
  });
  assert.equal(warm.lookup(addresses.ipv4)?.asn, expected.ipv4);
  assert.equal(warm.lookup(addresses.ipv6)?.asn, expected.ipv6);
  const report = {
    metadata: {
      revision: process.env.DN42_BENCH_REVISION ?? "working-tree",
      node: process.version,
      mitata: mitataPackage.version,
      gc: "exposed; mitata default once after warmup",
      platform: `${process.platform}-${process.arch}`,
      cpu: cpus()[0]?.model,
      dataset: externalData ? "public-release" : "synthetic-test-fixtures",
      release: process.env.DN42_BENCH_RELEASE ?? null,
      databases: {
        "city.mmdb": { bytes: city.length, sha256: checksums["city.mmdb"] },
        "asn.mmdb": { bytes: asn.length, sha256: checksums["asn.mmdb"] },
      },
      inputs,
      requests,
      databaseRequests,
      timingUnit: "nanoseconds per operation",
    },
    ...result,
  };
  const output = JSON.stringify(report, null, 2);
  if (process.env.DN42_BENCH_OUTPUT) {
    await writeFile(process.env.DN42_BENCH_OUTPUT, `${output}\n`);
  }
  console.log(output);
} finally {
  warm.dispose();
  disabled.dispose();
  server.closeAllConnections();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await rm(directory, { recursive: true });
}
