import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { cpus } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bench, do_not_optimize, group, run } from "mitata";
import { createDn42Intel } from "../packages/@birdcc/intel/dist/index.js";
import {
  findNetworkLiteralAt,
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
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sdkArchivePath = process.env.DN42_BENCH_SDK_ARCHIVE;
const sdkArchive = sdkArchivePath
  ? {
      name: basename(sdkArchivePath),
      sha256: digest(await readFile(sdkArchivePath)),
      url: process.env.DN42_BENCH_SDK_ARCHIVE_URL ?? null,
    }
  : undefined;
const artifactNames = [
  "DN42-IPDB-Country.mmdb",
  "DN42-IPDB-City.mmdb",
  "DN42-IPDB-ASN.mmdb",
  "DN42-IPDB-Connection-Type.mmdb",
  "asn-index.json",
  "metadata.json",
  "LICENSE-Unicode.txt",
];
const artifacts = new Map(
  await Promise.all(
    artifactNames.map(async (name) => [
      name,
      await readFile(join(dataDir, name)),
    ]),
  ),
);
const sourceArtifacts = Object.fromEntries(
  [...artifacts].map(([name, bytes]) => [
    name,
    { bytes: bytes.length, sha256: digest(bytes) },
  ]),
);
const checksums = Object.fromEntries(
  Object.entries(sourceArtifacts).map(([name, value]) => [name, value.sha256]),
);
if (externalData) {
  const published = JSON.parse(
    await readFile(join(dataDir, "checksums.json"), "utf8"),
  );
  for (const name of artifactNames)
    assert.equal(checksums[name], published[name]);
}
const sourceMetadata = JSON.parse(
  artifacts.get("metadata.json").toString("utf8"),
);
let manifest = JSON.stringify(checksums);
let revision = 0;
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
let artifactRequests = 0;
let mmdbRequests = 0;
let sink;
const server = createServer((request, response) => {
  requests++;
  if (request.url === "/checksums.json") response.end(manifest);
  else {
    const name = request.url?.slice(1);
    const bytes = artifacts.get(name);
    if (!bytes) return response.writeHead(404).end();
    artifactRequests++;
    if (name.endsWith(".mmdb")) mmdbRequests++;
    response.end(bytes);
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
  assert.equal(warm.lookupAsn(expected.ipv4)?.asn, expected.ipv4);
  assert.equal(warm.lookupAsn(1), undefined);
  assert.equal(warm.lookup("203.0.113.7"), undefined);
  assert.equal(warm.lookup("not-an-ip"), undefined);
  assert.equal(disabled.lookup(addresses.ipv4), undefined);
  assert.equal(disabled.lookupAsn(expected.ipv4), undefined);
  assert.equal(artifactRequests, 7);
  assert.equal(mmdbRequests, 4);
  const beforeDisabled = requests;
  await disabled.refresh();
  assert.equal(requests, beforeDisabled);
  await warm.refresh();
  assert.equal(artifactRequests, 7);
  const cached = createDn42Intel({ cacheDir, baseUrl });
  try {
    cached.setEnabled(true);
    await cached.refresh();
    assert.equal(cached.lookup(addresses.ipv4)?.asn, expected.ipv4);
    assert.equal(cached.lookupAsn(expected.ipv4)?.asn, expected.ipv4);
    assert.equal(artifactRequests, 7);
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
    for (const [label, provider, asn] of [
      ["disabled ASN control", disabled, expected.ipv4],
      ["ASN hit", warm, expected.ipv4],
      ["ASN miss", warm, 1],
    ]) {
      bench(`lookup / ${label}`, function* () {
        yield {
          0: () => asn,
          bench(value) {
            sink = provider.lookupAsn(value);
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
    const tail = `define LABEL = "😀"; define PEER = ${addresses.ipv4}; define PEER_AS = ${expected.ipv4};`;
    const input = `${prefix}\n${tail}\n# ${addresses.ipv4} AS${expected.ipv4}\n`;
    const hit = { line: count, character: tail.indexOf(addresses.ipv4) + 2 };
    const asnHit = {
      line: count,
      character: tail.indexOf(String(expected.ipv4)) + 2,
    };
    const comment = { line: count + 1, character: 4 };
    const miss = { line: count, character: 2 };
    assert.equal(
      (await findNetworkLiteralAt(input, hit))?.value,
      addresses.ipv4,
    );
    assert.equal(
      (await findNetworkLiteralAt(input, asnHit))?.value,
      String(expected.ipv4),
    );
    assert.equal((await findNetworkLiteralAt(input, asnHit))?.kind, "number");
    assert.equal(await findNetworkLiteralAt(input, comment), null);
    assert.equal(await findNetworkLiteralAt(input, miss), null);
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
        ["ASN after Unicode", asnHit],
        ["comment", comment],
        ["non-IP token", miss],
      ]) {
        bench(`parser / ${count} / ${label}`, async () => {
          sink = await findNetworkLiteralAt(input, position);
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
    bench("updater / changed metadata and full bundle activation", async () => {
      revision++;
      const bytes = Buffer.from(
        JSON.stringify({ ...sourceMetadata, benchmark_revision: revision }),
      );
      artifacts.set("metadata.json", bytes);
      checksums["metadata.json"] = digest(bytes);
      manifest = JSON.stringify(checksums);
      const before = artifactRequests;
      await warm.refresh();
      assert.equal(artifactRequests - before, 7);
      sink = warm.lookupAsn(expected.ipv4);
      assert.equal(sink?.asn, expected.ipv4);
      return do_not_optimize(sink);
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
      sdk: JSON.parse(
        await readFile(
          join(
            root,
            "packages/@birdcc/intel/node_modules/@birdcc/dn42-ipdb/package.json",
          ),
          "utf8",
        ),
      ).version,
      sdkArchive,
      codeSha256: Object.fromEntries(
        await Promise.all(
          [
            "tools/bench-dn42.mjs",
            "packages/@birdcc/intel/dist/dn42.js",
            "packages/@birdcc/parser/dist/index.js",
            "packages/@birdcc/intel/node_modules/@birdcc/dn42-ipdb/dist/index.js",
          ].map(async (name) => [
            name,
            digest(await readFile(join(root, name))),
          ]),
        ),
      ),
      gc: "exposed; mitata default once after warmup",
      platform: `${process.platform}-${process.arch}`,
      cpu: cpus()[0]?.model,
      dataset: externalData ? "public-release" : "synthetic-test-fixtures",
      release: process.env.DN42_BENCH_RELEASE ?? null,
      releaseRepository: sourceMetadata.release_repository,
      artifacts: sourceArtifacts,
      inputs,
      requests,
      artifactRequests,
      mmdbRequests,
      updateRevisions: revision,
      cpuAffinity: process.env.DN42_BENCH_CPU_AFFINITY ?? null,
      nodeOptions: process.env.NODE_OPTIONS ?? null,
      timingUnit: "nanoseconds per operation",
    },
    context: {
      now: result.context.now,
      arch: result.context.arch,
      version: result.context.version,
      runtime: result.context.runtime,
      cpu: result.context.cpu,
      noop: Object.fromEntries(
        Object.entries(result.context.noop).map(([kind, stats]) => [
          kind,
          { avg: stats.avg, p99: stats.p99, ticks: stats.ticks },
        ]),
      ),
    },
    benchmarks: result.benchmarks.map((benchmark) => ({
      alias: benchmark.alias,
      runs: benchmark.runs.map((trial) => ({
        name: trial.name,
        stats: {
          avg: trial.stats.avg,
          p50: trial.stats.p50,
          p75: trial.stats.p75,
          p99: trial.stats.p99,
          min: trial.stats.min,
          max: trial.stats.max,
          ticks: trial.stats.ticks,
          sampleCount: trial.stats.samples.length,
          optimizedOutWarning:
            trial.stats.avg <
            1.42 *
              result.context.noop[trial.stats.kind === "iter" ? "iter" : "fn"]
                .avg,
          heap: trial.stats.heap,
          gc: trial.stats.gc,
        },
      })),
    })),
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
