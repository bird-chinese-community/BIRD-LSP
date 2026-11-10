# DN42 IPDB benchmarks

`pnpm bench:dn42` runs 27 [mitata](https://github.com/evanwashere/mitata)
cases against the built parser and intelligence packages. It checks lookup
results, parser positions, cache reuse, and artifact request counts before
measuring. Each startup/install iteration also checks the loaded ASN.

The [hover formatting baseline](./dn42-hover.md) measures native Markdown
construction separately with four additional mitata cases.

## Measurement scope

- Lookup: one repeated IPv4/IPv6 hit, miss, invalid input, disabled-provider
  call, or ASN index hit/miss. All four MMDB readers and the ASN index are loaded.
- Parser: parse a generated document and locate an IP, ASN number, comment, or
  other token near its end. A Unicode string precedes both literals. Sizes are
  10, 1,000, and 10,000 integer declarations.
- Full parse control: `parseBirdConfig` also extracts the complete
  declaration/issue model. It performs more work than IP location.
- Unchanged manifest: take the cache lock, read its pointer, fetch a loopback
  checksum manifest, and verify all seven cached files and their database/JSON
  schemas. The provider retains its loaded readers.
- Existing cache startup: create a provider, read and verify seven cached files,
  initialize four MMDB readers and the ASN index, fetch the loopback manifest,
  repeat the unchanged-bundle verification, query one IPv4 address,
  and dispose.
- First install: create a directory, download seven artifacts over loopback,
  verify and activate them, query one IPv4 address, dispose, and remove the directory.
- Changed update: encode a new metadata revision and its checksum, refresh the
  loaded provider, download and activate seven artifacts, then query the ASN index.

The updater cases use actual HTTP and filesystem operations. Loopback transfer
and a warm operating-system file cache define their timing conditions. Public
Internet transfer time and the editor/LSP request path require separate
measurements. Percentiles use mitata's trimmed samples. Batched cases report
batch-average time rather than individual call latency.

## Reproduce

Run on the benchmark host with pnpm 10.18.3 and Node 22 or newer:

These commands use the canonical artifact names required by SDK 0.2.0. The
tables below retain their recorded code, SDK, and dataset revisions.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @birdcc/parser exec tsc -p tsconfig.json
cp packages/@birdcc/parser/src/tree-sitter-birdcc.wasm packages/@birdcc/parser/dist/tree-sitter-birdcc.wasm
pnpm --filter @birdcc/intel exec tsc -p tsconfig.json
mkdir -p .tmp/dn42-release .tmp/dn42-bench
curl --fail --location --proto '=https' --proto-redir '=https' \
  --max-time 45 --max-filesize 1048576 \
  --output .tmp/dn42-bench/birdcc-dn42-ipdb-0.2.0.tgz \
  https://github.com/bird-chinese-community/DN42-IPDB-SDK/releases/download/v0.2.0/birdcc-dn42-ipdb-0.2.0.tgz
gh release download 2026-11-10.13 \
  --repo bird-chinese-community/DN42-IPDB-Releases \
  --pattern DN42-IPDB-Country.mmdb --pattern DN42-IPDB-City.mmdb \
  --pattern DN42-IPDB-ASN.mmdb --pattern DN42-IPDB-Connection-Type.mmdb \
  --pattern asn-index.json \
  --pattern metadata.json --pattern LICENSE-Unicode.txt --pattern checksums.json \
  --dir .tmp/dn42-release
DN42_BENCH_DB_DIR="$PWD/.tmp/dn42-release" \
  DN42_BENCH_RELEASE=2026-11-10.13 \
  DN42_BENCH_REVISION="$(git rev-parse HEAD)" \
  DN42_BENCH_OUTPUT="$PWD/.tmp/dn42-bench/run.json" \
  DN42_BENCH_CPU_AFFINITY=2,3 \
  DN42_BENCH_SDK_ARCHIVE="$PWD/.tmp/dn42-bench/birdcc-dn42-ipdb-0.2.0.tgz" \
  DN42_BENCH_SDK_ARCHIVE_URL=https://github.com/bird-chinese-community/DN42-IPDB-SDK/releases/download/v0.2.0/birdcc-dn42-ipdb-0.2.0.tgz \
  NODE_OPTIONS=--max-old-space-size=2048 \
  taskset -c 2,3 pnpm bench:dn42 > .tmp/dn42-bench/run.log
```

Use the same available logical CPUs for subsequent runs. Omitting
`DN42_BENCH_DB_DIR` selects the small committed test bundle. Set
`DN42_BENCH_FILTER` to a regular expression to select cases. JSON output records
the revision, built-module hashes, SDK version, runtime, all seven artifact
hashes, input sizes, request counts, and mitata statistics. The public-release
checksum manifest is checked before measurement.

## 2026-11-10.1 seven-artifact baseline

The 27-case baseline uses SDK 0.1.0. SDK 0.1.1, used for the registered-country
reruns below, has the same published runtime-module SHA256; its archive version,
runtime requirement, and package documentation changed. Each report records its
measured SDK archive URL and checksum.

The [2026-11-10.1 release](https://github.com/bird-chinese-community/DN42-IPDB-Releases/releases/tag/2026-11-10.1)
supplies four MMDBs, the ASN index, metadata, and the Unicode notice. The test
server serves those published bytes. The changed-update case adds a metadata
revision while retaining the published database and ASN index bytes.

Measured on 2026-11-10 using the working tree based on
`5884dc63cf7ca21c5b29c7de5fdea5337608fdae`, SDK 0.1.0, Node 22.20.0,
mitata 1.0.34, and the same AMD Ryzen 7 7840HS Linux x64 host. The process used
logical CPUs 2 and 3 and a 2,048 MiB V8 old-space limit. Other task-owned
builds, tests, recording, and encoding were paused during measurement. The
host also runs unrelated services.

Two independent process runs record all 27 cases:
[run 1](./dn42-ipdb-2026-11-10.1-run-1.json) and
[run 2](./dn42-ipdb-2026-11-10.1-run-2.json). Their metadata includes all seven
published artifact hashes and the measured benchmark, provider, parser entry
point, and SDK module hashes, plus the installed SDK archive's SHA-256. Each case
retains its mean, percentiles, sample count, allocation summary, and mitata
optimization warning. Calibration
summaries are retained; calibration source and individual samples are omitted.

Ranges span the two processes. Retained sample counts are shown separately
from mitata's tick counts, which include batched operations. All 27 cases in
both runs have `optimizedOutWarning: false`.

| Case                                        | Mean / operation | P99 / operation | Retained samples |
| ------------------------------------------- | ---------------- | --------------- | ---------------- |
| Disabled lookup control                     | 4.71–5.08 ns     | 8.80–9.36 ns    | 33177–35844      |
| Warm IPv4 hit                               | 108–126 µs       | 399–441 µs      | 5533–6515        |
| Warm IPv6 hit                               | 37.3–41.1 µs     | 38.9–42.1 µs    | 12–12            |
| IPv4 miss                                   | 818–923 ns       | 974–1460 ns     | 182–206          |
| Invalid address                             | 39.6–45.0 ns     | 71.7–138 ns     | 3792–4315        |
| Disabled ASN control                        | 0.889–0.974 ns   | 1.65–1.77 ns    | 165892–181699    |
| ASN hit                                     | 73.9–81.9 ns     | 154–208 ns      | 2085–2321        |
| ASN miss                                    | 27.7–28.6 ns     | 46.0–55.8 ns    | 5977–6170        |
| Full parse / 10 declarations                | 68.2–81.3 µs     | 128–166 µs      | 8538–10190       |
| IP after Unicode / 10                       | 25.9–35.1 µs     | 27.5–37.0 µs    | 12–12            |
| ASN after Unicode / 10                      | 25.2–34.0 µs     | 26.3–35.8 µs    | 12–12            |
| Comment / 10                                | 22.9–31.6 µs     | 23.3–32.7 µs    | 12–12            |
| Non-network token / 10                      | 24.7–33.1 µs     | 25.8–34.3 µs    | 12–12            |
| Full parse / 1000 declarations              | 27.2–27.7 ms     | 29.0–31.4 ms    | 22–22            |
| IP after Unicode / 1000                     | 1.72–2.21 ms     | 2.26–2.77 ms    | 315–404          |
| ASN after Unicode / 1000                    | 1.70–2.20 ms     | 2.14–2.60 ms    | 317–409          |
| Comment / 1000                              | 1.73–2.07 ms     | 2.47–2.56 ms    | 336–403          |
| Non-network token / 1000                    | 1.69–2.18 ms     | 2.22–2.59 ms    | 318–413          |
| Full parse / 10000 declarations             | 2.37–2.39 s      | 2.39–2.42 s     | 12–12            |
| IP after Unicode / 10000                    | 17.3–22.1 ms     | 18.1–23.4 ms    | 28–37            |
| ASN after Unicode / 10000                   | 17.6–21.7 ms     | 18.5–22.3 ms    | 29–36            |
| Comment / 10000                             | 17.2–21.8 ms     | 18.1–22.8 ms    | 29–37            |
| Non-network token / 10000                   | 17.2–21.6 ms     | 17.9–22.5 ms    | 29–37            |
| Unchanged manifest and cached verification  | 65.8–67.5 ms     | 85.5–96.9 ms    | 12–12            |
| Existing cache startup and manifest         | 154–163 ms       | 169–172 ms      | 12–12            |
| First install with cleanup                  | 183–185 ms       | 196–209 ms      | 12–12            |
| Changed metadata and full bundle activation | 182–184 ms       | 204–204 ms      | 12–12            |

The registered-country lookup projection was measured in two independent
processes using `5acb8442511884142c71bc9993634c7dfee58533+working-tree`,
SDK 0.1.1 from the npm registry, and the same 2026-11-10.1 data, Node 22.20.0,
mitata 1.0.34, host, CPU affinity and memory limit:
[run 1](./dn42-ipdb-hover-refresh-run-1.json) and
[run 2](./dn42-ipdb-hover-refresh-run-2.json). Both reports record the installed
SDK archive checksum and measured module hashes. GUI recording and task builds
were stopped; unrelated host services remained active. These five cases cover
the changed IP lookup projection and the startup/install paths that call it;
hover formatting and the editor/LSP request path are outside their scope.
Ranges span both processes; retained sample counts are listed in run order.
All ten measurements have `optimizedOutWarning: false`.

| Case                                | Mean / operation | P99 / operation | Retained samples |
| ----------------------------------- | ---------------- | --------------- | ---------------- |
| Warm IPv4 hit                       | 104–119 µs       | 315–397 µs      | 6736 / 5880      |
| Warm IPv6 hit                       | 36.6–40.7 µs     | 37.7–70.1 µs    | 12 / 17106       |
| IPv4 miss                           | 823–877 ns       | 1041–1114 ns    | 205 / 192        |
| Existing cache startup and manifest | 151–155 ms       | 167–179 ms      | 12 / 12          |
| First install with cleanup          | 178–179 ms       | 196–197 ms      | 12 / 12          |

## 2026-11-10 two-database baseline

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
