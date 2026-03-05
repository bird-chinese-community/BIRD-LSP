/**
 * Build script: downloads ASN CSV from BGP.Tools OpenDB and converts to compressed msgpack.
 *
 * Usage:
 *   node --import tsx/esm scripts/build-db.ts [--csv path/to/asns.csv]
 *
 * Without --csv, it downloads from the canonical URL automatically.
 */

import {
  createReadStream,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { parse } from "csv-parse";
import { encode } from "@msgpack/msgpack";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DB_DIR = resolve(ROOT, "db");
const OUT_PATH = resolve(DB_DIR, "asn-db.bin.gz");

const CSV_URL =
  "https://raw.githubusercontent.com/Alice39s/BGP.Tools-OpenDB/refs/heads/auto-update/asns/asns.csv";

interface AsnRecord {
  asn: number;
  name: string;
  cls: string;
  cc: string;
}

const parseCsvStream = (
  stream: NodeJS.ReadableStream,
): Promise<AsnRecord[]> => {
  const records: AsnRecord[] = [];

  return new Promise((resolve, reject) => {
    stream
      .pipe(parse({ columns: true, trim: true }))
      .on(
        "data",
        (row: { asn: string; name: string; class: string; cc: string }) => {
          const asnNum = parseInt(row.asn.replace(/^AS/, ""), 10);
          if (Number.isNaN(asnNum)) return;

          records.push({
            asn: asnNum,
            name: row.name,
            cls: row.class === "Unknown" ? "" : row.class,
            cc: row.cc,
          });
        },
      )
      .on("end", () => resolve(records))
      .on("error", reject);
  });
};

const downloadCsv = async (): Promise<NodeJS.ReadableStream> => {
  console.log(`[build-db] Downloading CSV from ${CSV_URL}`);
  const res = await fetch(CSV_URL);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download CSV: ${res.status} ${res.statusText}`);
  }
  // Convert web ReadableStream to Node stream via a passthrough
  const { Readable } = await import("node:stream");
  return Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const csvIdx = args.indexOf("--csv");
  const csvPath = csvIdx >= 0 ? args[csvIdx + 1] : undefined;

  let stream: NodeJS.ReadableStream;
  if (csvPath) {
    console.log(`[build-db] Reading local CSV: ${csvPath}`);
    stream = createReadStream(csvPath);
  } else {
    stream = await downloadCsv();
  }

  const records = await parseCsvStream(stream);
  console.log(`[build-db] Parsed ${records.length} ASN records`);

  // Sort by ASN number for consistent output
  records.sort((a, b) => a.asn - b.asn);

  // Columnar layout for maximum compression
  const asns = new Uint32Array(records.length);
  const names: string[] = [];
  const classes: string[] = [];
  const ccs: string[] = [];

  for (let i = 0; i < records.length; i++) {
    asns[i] = records[i].asn;
    names.push(records[i].name);
    classes.push(records[i].cls);
    ccs.push(records[i].cc);
  }

  const payload = encode([Array.from(asns), names, classes, ccs]);
  console.log(
    `[build-db] MessagePack size: ${(payload.byteLength / 1024).toFixed(1)} KB`,
  );

  const compressed = gzipSync(Buffer.from(payload), { level: 9 });
  console.log(
    `[build-db] Gzipped size: ${(compressed.byteLength / 1024).toFixed(1)} KB`,
  );

  if (!existsSync(DB_DIR)) {
    mkdirSync(DB_DIR, { recursive: true });
  }
  writeFileSync(OUT_PATH, compressed);
  console.log(`[build-db] Written to: ${OUT_PATH}`);

  const ratio = (
    (1 - compressed.byteLength / payload.byteLength) *
    100
  ).toFixed(1);
  console.log(`[build-db] Compression ratio: ${ratio}%`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
