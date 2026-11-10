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
`7e7352f019106b8d582375c140e77600bc3e976a419c9a2470e79376c0f553f3`. Results
are retained in [run 1](./dn42-hover-run-1.json) and
[run 2](./dn42-hover-run-2.json).

Ranges span the two processes. Retained samples are shown in run order. All
sixteen measurements have `optimizedOutWarning: false`. Two earlier pairs of
processes on the same build each had one case that mitata recorded with
per-iteration samples (P99 up to 64.46 µs); their means were within 2.2 µs of
the ranges below.

| Form     | Input                                  | Mean / operation | P99 / operation | Retained samples | Output bytes |
| -------- | -------------------------------------- | ---------------- | --------------- | ---------------- | ------------ |
| HTML     | GeoFeed IP                             | 5.41-5.65 µs     | 6.22-6.99 µs    | 27 / 26          | 1,262        |
| HTML     | Resolver and origin conflicts          | 8.57-9.07 µs     | 9.00-9.82 µs    | 16 / 15          | 2,186        |
| HTML     | Long IPv6 and 256 observations         | 10.70-11.00 µs   | 11.15-11.31 µs  | 12 / 12          | 2,314        |
| HTML     | ASN with 256 prefixes and observations | 18.83-19.17 µs   | 19.65-20.46 µs  | 12 / 12          | 2,575        |
| Markdown | GeoFeed IP                             | 9.97-10.03 µs    | 10.52-10.73 µs  | 14 / 13          | 248          |
| Markdown | Resolver and origin conflicts          | 15.59-16.37 µs   | 16.70-17.21 µs  | 12 / 12          | 413          |
| Markdown | Long IPv6 and 256 observations         | 18.43-19.01 µs   | 19.02-20.89 µs  | 12 / 12          | 612          |
| Markdown | ASN with 256 prefixes and observations | 26.92-27.30 µs   | 27.60-28.91 µs  | 12 / 12          | 534          |

Each collection shows at most two items, so output size stays bounded; the
renderer still scans every observation to select them. The ASN cases also
count ROA and IRR results across all 256 member observations. The Markdown form
spends most of its time in per-value escaping. This establishes a baseline for subsequent
runs with the same inputs and conditions. It does not establish editor
response time.
