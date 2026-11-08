# ASN database

`asn-db.bin.gz` is the ASN snapshot that `@birdcc/intel` loads by default. It is a gzip-compressed MessagePack array `[asns, names, classes, ccs]` that `scripts/build-db.ts` builds from `asns/asns.csv` on the `auto-update` branch of [BGP.Tools-OpenDB](https://github.com/Alice39s/BGP.Tools-OpenDB).

The `Intel ASN Database Update (Weekly)` workflow (`.github/workflows/intel-asn-update.yml`) rebuilds this file every Monday at 04:00 UTC. When the file changes, the workflow adds a patch changeset for `@birdcc/intel` and opens a pull request from the `feat/weekly-asn-database` branch; the new file reaches `main` when that pull request is merged.

To rebuild the file locally, run `pnpm --filter @birdcc/intel build:db` from the repository root.
