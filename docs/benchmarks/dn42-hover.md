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
`ecf7551c2a956c38984175de9dac13bf6b335aafb96fc9f19876649c37d2afe9`. Results
are retained in [run 1](./dn42-hover-run-1.json) and
[run 2](./dn42-hover-run-2.json).

Ranges span the two processes. Retained samples are shown in run order. All
sixteen measurements have `optimizedOutWarning: false`. The Markdown ASN case
runs close to the point where mitata switches from batched to per-iteration
samples. Run 1 retained 25,179 per-iteration samples for it, so its P99 includes
single-operation outliers; run 2 retained 12 batched samples.

| Form     | Input                                  | Mean / operation | P99 / operation | Retained samples | Output bytes |
| -------- | -------------------------------------- | ---------------- | --------------- | ---------------- | ------------ |
| HTML     | GeoFeed IP                             | 5.61-5.65 µs     | 5.95-6.23 µs    | 26 / 26          | 1,252        |
| HTML     | Resolver and origin conflicts          | 8.39-8.62 µs     | 8.68-9.10 µs    | 17 / 16          | 2,206        |
| HTML     | Long IPv6 and 256 observations         | 10.40-10.91 µs   | 10.65-11.31 µs  | 13 / 12          | 2,304        |
| HTML     | ASN with 256 prefixes and observations | 18.39-20.03 µs   | 19.01-20.12 µs  | 12 / 12          | 2,595        |
| Markdown | GeoFeed IP                             | 10.43-10.85 µs   | 10.76-11.33 µs  | 13 / 12          | 287          |
| Markdown | Resolver and origin conflicts          | 16.73-16.93 µs   | 17.50-17.93 µs  | 12 / 12          | 436          |
| Markdown | Long IPv6 and 256 observations         | 18.44-18.63 µs   | 18.86-19.48 µs  | 12 / 12          | 651          |
| Markdown | ASN with 256 prefixes and observations | 26.07-27.51 µs   | 27.60-60.28 µs  | 25,179 / 12      | 557          |

Each collection shows at most two items, so output size stays bounded; the
renderer still scans every observation to select them. The ASN cases also
count ROA and IRR results across all 256 member observations. The Markdown form
spends most of its time in per-value escaping. This establishes a baseline for subsequent
runs with the same inputs and conditions. It does not establish editor
response time.
