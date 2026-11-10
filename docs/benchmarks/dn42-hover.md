# DN42 hover formatting baseline

`pnpm bench:dn42:hover` measures the built native Markdown renderers with
[mitata](https://github.com/evanwashere/mitata). Four synthetic inputs cover a
GeoFeed result, a resolver with conflicting origin observations, a long IPv6
address with 256 observations, and an ASN with 256 prefixes and observations.
Before measuring, the script checks source escaping, registry attribution,
policy scope, service evidence and identifiers.

These measurements cover Markdown string construction. They exclude database
lookup, IPC, LSP dispatch and editor rendering. The
[provider and parser baselines](./dn42-ipdb.md) measure those components
separately. Mitata uses batches for these cases, so percentiles describe
batch-average operation time rather than individual hover request latency.

## Reproduce

Build the workspace on the benchmark host, then run two independent processes:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
for run in 1 2; do
  DN42_HOVER_BENCH_OUTPUT="$PWD/docs/benchmarks/dn42-hover-run-$run.json" \
    DN42_HOVER_BENCH_REVISION="$(git rev-parse HEAD)" \
    DN42_HOVER_BENCH_CPU_AFFINITY=2,3 \
    NODE_OPTIONS=--max-old-space-size=2048 \
    taskset -c 2,3 pnpm bench:dn42:hover
done
```

Choose logical CPUs available on the host and keep the same selection for
subsequent runs. Each JSON report records the benchmark, renderer source and
built-module SHA256, all four input digests and sizes, runtime, host, affinity,
retained sample counts, heap/GC summaries and optimization warnings.

## 2026-11-10 baseline

Two independent processes ran on Debian Linux x64 with an AMD Ryzen 7 7840HS,
Node 22.20.0 and mitata 1.0.34. Both used logical CPUs 2 and 3, an exposed GC
with mitata's default collection after warmup, and a 2,048 MiB V8 old-space
limit. Task-owned builds, tests, probing and recording were stopped during
measurement. The host also runs unrelated services.

The reports identify the measured working tree based on `e342fdad`; its exact
renderer source SHA256 is
`b1bd06a9b2aa6f3432bb61d230eec11cbff2758a59ea48b592c8e0fb752e6227`,
committed as `bd25620a`. Results are retained in
[run 1](./dn42-hover-run-1.json) and [run 2](./dn42-hover-run-2.json).

Ranges span the two processes. Retained samples are shown in run order. All
eight measurements have `optimizedOutWarning: false`.

| Input                                  | Mean / operation | P99 / operation | Retained samples |
| -------------------------------------- | ---------------- | --------------- | ---------------- |
| GeoFeed IP                             | 2.17-2.22 µs     | 2.33-2.55 µs    | 73 / 75          |
| Resolver and origin conflicts          | 4.56-4.60 µs     | 5.37-5.53 µs    | 34 / 34          |
| Long IPv6 and 256 observations         | 7.38-7.63 µs     | 8.01-8.25 µs    | 19 / 19          |
| ASN with 256 prefixes and observations | 6.07-6.67 µs     | 7.63-7.70 µs    | 22 / 24          |

This establishes a baseline for subsequent runs with the same inputs and
conditions. It does not establish editor response time or a speedup over a
previous renderer.
