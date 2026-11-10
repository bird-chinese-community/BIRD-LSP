# DN42 IPDB benchmarks

`pnpm bench:dn42` runs 20 [mitata](https://github.com/evanwashere/mitata)
cases against the built parser and intelligence packages. It checks lookup
results, parser positions, cache reuse, and database request counts before
measuring. Each startup/install iteration also checks the loaded ASN.

## Measurement scope

- Lookup: one repeated IPv4/IPv6 hit, miss, invalid input, or disabled-provider
  call. Readers and address caches are warm.
- Parser: parse a generated document and locate an IP, comment, or non-IP token
  near its end. A Unicode string precedes the IP. Sizes are 10, 1,000, and
  10,000 integer declarations.
- Full parse control: `parseBirdConfig` also extracts the complete
  declaration/issue model. It performs more work than IP location.
- Unchanged manifest: take the cache lock, read its pointer, fetch a loopback
  checksum manifest, and release the lock. The loaded readers are retained.
- Existing cache startup: create a provider, read and verify cached MMDBs,
  initialize readers, fetch the loopback manifest, query one IPv4 address,
  and dispose.
- First install: create a directory, download both MMDBs over loopback, verify
  and activate them, query one IPv4 address, dispose, and remove the directory.

The updater cases use actual HTTP and filesystem operations. Loopback transfer
and a warm operating-system file cache define their timing conditions. Public
Internet transfer time and the editor/LSP request path require separate
measurements. Percentiles use mitata's trimmed samples. Batched cases report
batch-average time rather than individual call latency.

## Reproduce

Run on the benchmark host with pnpm 10.18.3 and Node 22 or newer:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @birdcc/parser exec tsc -p tsconfig.json
cp packages/@birdcc/parser/src/tree-sitter-birdcc.wasm packages/@birdcc/parser/dist/tree-sitter-birdcc.wasm
pnpm --filter @birdcc/intel exec tsc -p tsconfig.json
mkdir -p .tmp/dn42-release .tmp/dn42-bench
gh release download 2026-11-10 \
  --repo bird-chinese-community/DN42-IPDB-Releases \
  --pattern city.mmdb --pattern asn.mmdb --pattern checksums.json \
  --dir .tmp/dn42-release
DN42_BENCH_DB_DIR="$PWD/.tmp/dn42-release" \
  DN42_BENCH_RELEASE=2026-11-10 \
  DN42_BENCH_REVISION="$(git rev-parse HEAD)" \
  DN42_BENCH_OUTPUT="$PWD/.tmp/dn42-bench/run.json" \
  NODE_OPTIONS=--max-old-space-size=2048 \
  taskset -c 2,3 pnpm bench:dn42 > .tmp/dn42-bench/run.log
```

Use the same available logical CPUs for subsequent runs. Omitting
`DN42_BENCH_DB_DIR` selects the small committed test MMDBs. Set
`DN42_BENCH_FILTER` to a regular expression to select cases. JSON output records
the revision, runtime, dataset hashes, input sizes, and mitata statistics.

## Initial baseline

Measured on 2026-11-10 at `6dc70afbc3bdc2b8cf038dbedf8f1e5ce644f11e`,
using Node 22.20.0, mitata 1.0.34, and an AMD Ryzen 7 7840HS Linux x64 host.
The process used logical CPUs 2 and 3 and a 2,048 MiB V8 old-space limit.
Manual GC was exposed, with mitata's default collection after warmup.
Other task-owned build, test, recording, and encoding jobs were paused during
each measurement run. The host also runs unrelated services.

The [2026-11-10 release](https://github.com/bird-chinese-community/DN42-IPDB-Releases/releases/tag/2026-11-10)
provided the 16,163-byte City MMDB and 612,431-byte ASN MMDB. Their SHA-256
digests and per-case sample counts are in the result files.

Ranges below span two independent process runs. Both use the same code,
dataset, and CPU affinity. JSON summaries retain the mean, percentiles, ticks,
and retained sample count: [run 1](./dn42-ipdb-run-1.json) and
[run 2](./dn42-ipdb-run-2.json). Generated calibration traces and individual
samples are omitted from these summaries.

| Case                            | Mean / operation | P99 / operation |
| ------------------------------- | ---------------- | --------------- |
| Disabled lookup control         | 2.63-2.64 ns     | 4.90 ns         |
| Warm IPv4 hit                   | 3.27-3.44 µs     | 3.95-4.09 µs    |
| Warm IPv6 hit                   | 2.51-2.60 µs     | 3.21-3.81 µs    |
| IPv4 miss                       | 398-445 ns       | 649-813 ns      |
| Invalid address                 | 40.8 ns          | 77.3-79.7 ns    |
| Full parse / 10 declarations    | 68.5-69.0 µs     | 239-282 µs      |
| IP after Unicode / 10           | 25.5 µs          | 26.4-29.0 µs    |
| Comment / 10                    | 22.4-24.0 µs     | 23.2-25.9 µs    |
| Non-IP token / 10               | 23.4-24.1 µs     | 24.5-25.3 µs    |
| Full parse / 1000 declarations  | 27.6-28.0 ms     | 30.2-30.4 ms    |
| IP after Unicode / 1000         | 1.78-1.79 ms     | 2.37-2.56 ms    |
| Comment / 1000                  | 1.77-1.78 ms     | 2.37-2.39 ms    |
| Non-IP token / 1000             | 1.75-1.76 ms     | 2.17-2.24 ms    |
| Full parse / 10000 declarations | 2.42-2.46 s      | 2.46-2.51 s     |
| IP after Unicode / 10000        | 17.8-18.4 ms     | 18.6-20.3 ms    |
| Comment / 10000                 | 18.1-18.9 ms     | 19.9-22.5 ms    |
| Non-IP token / 10000            | 18.9-19.6 ms     | 21.7-22.6 ms    |
| Unchanged manifest              | 1.20-1.34 ms     | 4.37-5.04 ms    |
| Existing cache startup          | 2.26-2.53 ms     | 12.2-14.3 ms    |
| First install with cleanup      | 5.82-5.95 ms     | 15.3-15.7 ms    |

These measurements establish an initial baseline for future runs with the
same conditions. The full parse control includes AST extraction, while the IP
cases return one syntax location.
