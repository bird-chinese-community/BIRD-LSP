import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { bench, do_not_optimize, run } from "mitata";
import {
  formatDn42AsnHover,
  formatDn42IpHover,
} from "../packages/@birdcc/lsp/dist/dn42-hover.js";

assert.equal(typeof globalThis.gc, "function", "Run Node with --expose-gc");
assert.ok(process.env.DN42_HOVER_BENCH_OUTPUT, "Set DN42_HOVER_BENCH_OUTPUT");
const root = new URL("../", import.meta.url);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const observation = (index, kind = "irr") => ({
  target: `172.20.${index % 256}.0/24`,
  kind,
  status:
    index % 3 === 0
      ? kind === "roa"
        ? "invalid"
        : "conflict"
      : kind === "roa"
        ? "valid"
        : "exact",
  value: `172.20.${index % 256}.0/24`,
  asn: 4242420001 + index,
  method: "registry-route-check",
  source: "https://example.invalid/registry",
  authority: "dn42-registry",
  observed_at: "2026-11-10T00:00:00Z",
});
const base = {
  ip: "172.20.0.53",
  prefix: "172.20.0.53/32",
  asn: 4242420001,
  asName: "Benchmark <network> & operator",
  country: "JP",
  countryName: "Japan",
  city: "Tokyo",
  dn42: {
    schema_version: "2",
    confidence: "geofeed",
    prefix: "172.20.0.53/32",
    anycast: "unknown",
    network_types: [],
    ptr: [],
    roa_status: "valid",
    roa_prefix: "172.20.0.0/24",
    irr_status: "exact",
    irr_prefix: "172.20.0.0/24",
    observations: [],
    evidence: [],
  },
};
const resolver = {
  ...base,
  country: undefined,
  countryName: undefined,
  city: undefined,
  dn42: {
    ...base.dn42,
    anycast: "published",
    network_types: ["anycast", "public-resolver", "bgp-path-tunnel"],
    roa_status: "unknown",
    irr_status: "unknown",
    observations: [observation(0), observation(3)],
  },
};
const longIPv6 = {
  ...base,
  ip: "fd42:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
  prefix: "fd42:ffff:ffff:ffff::/64",
  dn42: {
    ...base.dn42,
    prefix: "fd42:ffff:ffff:ffff::/64",
    roa_prefix: "fd42:ffff:ffff:ffff::/64",
    irr_prefix: "fd42:ffff:ffff:ffff::/64",
    ptr: ["tokyo-router-with-a-long-hostname.example.dn42"],
    observations: Array.from({ length: 256 }, (_, index) => ({
      ...observation(index),
      target: "fd42:ffff:ffff:ffff:ffff:ffff:ffff:ffff/128",
      value: "fd42:ffff:ffff:ffff::/64",
    })),
  },
};
const asn = {
  asn: 4242420001,
  as_name: base.asName,
  prefixes: Array.from({ length: 256 }, (_, index) => `172.20.${index}.0/24`),
  registered_countries: [{ iso_code: "DE", names: { en: "Germany" } }],
  observed_network_types: ["public-resolver"],
  observations: Array.from({ length: 256 }, (_, index) =>
    observation(index, index % 2 === 0 ? "roa" : "irr"),
  ),
};
const inputs = [
  { name: "IP / GeoFeed", input: base, format: formatDn42IpHover },
  {
    name: "IP / resolver and conflicts",
    input: resolver,
    format: formatDn42IpHover,
  },
  {
    name: "IP / long IPv6 and 256 observations",
    input: longIPv6,
    format: formatDn42IpHover,
  },
  {
    name: "ASN / 256 prefixes and observations",
    input: asn,
    format: formatDn42AsnHover,
  },
];
const escapedName = {
  html: "Benchmark &#60;network&#62; &#38; operator",
  markdown: "Benchmark \\<network\\> \\& operator",
};
const cases = ["html", "markdown"].flatMap((markup) =>
  inputs.map((item) => ({
    ...item,
    name: `${markup} / ${item.name}`,
    markup,
    render: () => item.format(item.input, markup),
  })),
);

for (const item of cases) {
  const output = item.render();
  assert.ok(output.includes(escapedName[item.markup]), "Escape source markup");
  assert.ok(!output.includes("<network>"), "Escape source markup");
  // The inputs contain no backslashes, so removing escapes yields visible text.
  const visible =
    item.markup === "markdown" ? output.replaceAll("\\", "") : output;
  assert.ok(visible.includes("DN42 IPDB · registry data"));
  assert.ok(
    visible.includes(item.input.dn42?.roa_prefix ?? "172.20.0.0/24"),
    "Keep policy prefix scope",
  );
  if (item.input === resolver) {
    assert.ok(visible.includes("Anycast") && visible.includes("published"));
    assert.ok(visible.includes("Conflict"));
  }
  if (item.input === longIPv6) assert.ok(visible.includes(longIPv6.ip));
  if (item.input === asn) assert.ok(visible.includes("254 more"));
  bench(item.name, () => do_not_optimize(item.render()));
}

const result = await run({ colors: false });
const codeSha256 = Object.fromEntries(
  await Promise.all(
    [
      "tools/bench-dn42-hover.mjs",
      "packages/@birdcc/lsp/src/dn42-hover.ts",
      "packages/@birdcc/lsp/dist/dn42-hover.js",
    ].map(async (name) => [name, digest(await readFile(new URL(name, root)))]),
  ),
);
const packageInfo = JSON.parse(
  await readFile(new URL("node_modules/mitata/package.json", root), "utf8"),
);
const report = {
  metadata: {
    measuredAt: new Date().toISOString(),
    revision: process.env.DN42_HOVER_BENCH_REVISION ?? null,
    node: process.version,
    mitata: packageInfo.version,
    platform: `${process.platform}-${process.arch}`,
    cpu: cpus()[0]?.model,
    cpuAffinity: process.env.DN42_HOVER_BENCH_CPU_AFFINITY ?? null,
    nodeOptions: process.env.NODE_OPTIONS ?? null,
    gc: "exposed; mitata default once after warmup",
    scope:
      "HTML and Markdown hover formatting only; synthetic inputs; excludes lookup, IPC and editor rendering",
    timingUnit: "nanoseconds per operation",
    codeSha256,
    inputs: cases.map((item) => ({
      name: item.name,
      sha256: digest(JSON.stringify(item.input)),
      observations:
        item.input.dn42?.observations.length ?? item.input.observations.length,
      prefixes: item.input.prefixes?.length ?? 1,
      outputBytes: Buffer.byteLength(item.render()),
    })),
  },
  benchmarks: result.benchmarks.map((benchmark) => ({
    alias: benchmark.alias,
    runs: benchmark.runs.map((trial) => ({
      name: trial.name,
      stats: {
        avg: trial.stats.avg,
        p50: trial.stats.p50,
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
await writeFile(
  process.env.DN42_HOVER_BENCH_OUTPUT,
  `${JSON.stringify(report, null, 2)}\n`,
);
