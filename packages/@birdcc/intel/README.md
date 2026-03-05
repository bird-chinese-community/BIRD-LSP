# @birdcc/intel

ASN intelligence database for the BIRD2 LSP toolchain.

Provides near-instant ASN lookup (exact + prefix search) powered by a compressed msgpack binary derived from [BGP.Tools OpenDB](https://github.com/Alice39s/BGP.Tools-OpenDB).

## Features

- **Exact lookup** — O(1) via `Map`, ~68ps per call
- **Prefix search** — Binary search + lexicographic scan, ~200-240ns for limit=10
- **Country flag emoji** — ISO 3166-1 alpha-2 → regional indicator symbols
- **Display formatting** — Inlay hints, completion details, hover markdown

## Usage

```typescript
import { createAsnIntel } from "@birdcc/intel";

const intel = createAsnIntel();

// Exact lookup
const entry = intel.exactLookup(13335);
// => { asn: 13335, name: "Cloudflare, Inc.", cls: "Content", cc: "US" }

// Prefix search
const results = intel.prefixSearch("1333", 5);
// => [{ asn: 13335, ... }, ...]

// Formatted display
const display = intel.lookupDisplay(13335);
// => { inlayLabel: "🇺🇸 AS13335", completionDetail: "🇺🇸 AS13335 · Cloudflare, Inc.", ... }
```

## Database Rebuild

```bash
# Download latest CSV and rebuild
pnpm build:db

# Or use a local CSV file
pnpm build:db -- --csv ./path/to/asns.csv
```

## Versioning

This package uses calendar versioning (`YYYY.MM.DD`) and is updated weekly via CI.

## License

GPL-3.0-only
