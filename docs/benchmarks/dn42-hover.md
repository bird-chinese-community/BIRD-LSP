# DN42 hover formatting baseline

`pnpm bench:dn42:hover` measures the built hover renderers with
[mitata](https://github.com/evanwashere/mitata). Each of four synthetic inputs
is rendered in the HTML form, used by clients that allow `span` and `table`
tags in Markdown, and in the portable Markdown form. The inputs cover a GeoFeed
result, a resolver with conflicting origin observations, a long IPv6 address
with 256 observations, and an ASN with 256 prefixes and observations. Before
measuring, the script checks source escaping, registry attribution, policy
scope, service evidence and identifiers.

These measurements cover string construction. They exclude database lookup,
IPC, LSP dispatch and editor rendering. The
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
built-module SHA256, all input digests and output sizes, runtime, host,
affinity, retained sample counts, heap/GC summaries and optimization warnings.

## 2026-11-10 baseline

Two independent processes ran on Debian Linux x64 with an AMD Ryzen 7 7840HS,
Node 22.20.0 and mitata 1.0.34. Both used logical CPUs 2 and 3, an exposed GC
with mitata's default collection after warmup, and a 2,048 MiB V8 old-space
limit. No task-owned build, test or recording ran during measurement. The host
also runs unrelated services.

The renderer source SHA256 is
`5392671e28437c82b760fd563598367f08a38f7c97f2a57db7fb8f5e58055560`. Results
are retained in [run 1](./dn42-hover-run-1.json) and
[run 2](./dn42-hover-run-2.json).

Ranges span the two processes. Retained samples are shown in run order. All
sixteen measurements have `optimizedOutWarning: false`.

| Form     | Input                                  | Mean / operation | P99 / operation | Retained samples | Output bytes |
| -------- | -------------------------------------- | ---------------- | --------------- | ---------------- | ------------ |
| HTML     | GeoFeed IP                             | 5.32-5.36 µs     | 6.44-6.71 µs    | 28 / 28          | 1,262        |
| HTML     | Resolver and origin conflicts          | 8.23-8.58 µs     | 8.56-8.88 µs    | 17 / 16          | 2,186        |
| HTML     | Long IPv6 and 256 observations         | 10.05-10.58 µs   | 10.45-10.92 µs  | 13 / 12          | 2,314        |
| HTML     | ASN with 256 prefixes and observations | 8.46-8.57 µs     | 9.10-9.26 µs    | 16 / 16          | 1,327        |
| Markdown | GeoFeed IP                             | 9.47-10.16 µs    | 9.99-11.16 µs   | 14 / 13          | 248          |
| Markdown | Resolver and origin conflicts          | 16.10-16.36 µs   | 16.91-17.76 µs  | 12 / 12          | 413          |
| Markdown | Long IPv6 and 256 observations         | 17.59-17.79 µs   | 18.31-19.57 µs  | 12 / 12          | 612          |
| Markdown | ASN with 256 prefixes and observations | 12.36-12.69 µs   | 12.74-13.27 µs  | 10 / 10          | 314          |

Each collection shows at most two items, so output size stays bounded; the
renderer still scans every observation to select them. The Markdown form spends
most of its time in per-value escaping. This establishes a baseline for subsequent
runs with the same inputs and conditions. It does not establish editor
response time.
