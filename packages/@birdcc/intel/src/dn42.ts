import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { readdirSync, renameSync, rmSync } from "node:fs";
import { isIP } from "node:net";
import { join } from "node:path";
import { Reader, type AsnResponse, type CityResponse } from "maxmind";
import { lock } from "proper-lockfile";
import { z } from "zod";

const DEFAULT_URL =
  "https://github.com/bird-chinese-community/DN42-IPDB-Releases/releases/latest/download/";
const CHECK_INTERVAL = 24 * 60 * 60 * 1000;
const RETRY_INTERVAL = 60 * 60 * 1000;
const LOCK_RETRY_INTERVAL = 30_000;
const TIMEOUT = 30_000;
const MAX_DB_BYTES = 32 * 1024 * 1024;
const MAX_CHECKSUM_BYTES = 64 * 1024;
const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const checksumsSchema = z
  .object({
    "city.mmdb": hashSchema,
    "asn.mmdb": hashSchema,
  })
  .catchall(z.string());
const pointerSchema = z.object({
  version: z.string().regex(/^[0-9a-f]{64}$/),
  checksums: checksumsSchema,
});
type Checksums = z.infer<typeof checksumsSchema>;
type Pair = {
  city: Reader<CityResponse>;
  asn: Reader<AsnResponse>;
  checksums: Checksums;
};

export interface Dn42IpInfo {
  asn?: number;
  asName?: string;
  country?: string;
  region?: string;
  city?: string;
  prefix?: string;
}

export interface Dn42IntelOptions {
  cacheDir: string;
  onUpdate?: () => void;
  onError?: (error: Error) => void;
  baseUrl?: string;
}

export interface Dn42Intel {
  setEnabled(enabled: boolean): void;
  lookup(ip: string): Dn42IpInfo | undefined;
  refresh(): Promise<void>;
  dispose(): void;
}

function hash(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function verifyPair(
  cityBytes: Buffer,
  asnBytes: Buffer,
  checksums: Checksums,
): Pair {
  if (
    hash(cityBytes) !== checksums["city.mmdb"] ||
    hash(asnBytes) !== checksums["asn.mmdb"]
  ) {
    throw new Error("DN42 database checksum mismatch");
  }
  const city = new Reader<CityResponse>(cityBytes);
  const asn = new Reader<AsnResponse>(asnBytes);
  if (
    city.metadata.databaseType !== "DN42-City" ||
    asn.metadata.databaseType !== "DN42-ASN"
  ) {
    throw new Error("DN42 database type mismatch");
  }
  return { city, asn, checksums };
}

async function readBounded(path: string, maxBytes: number): Promise<Buffer> {
  const info = await stat(path);
  if (!info.isFile() || info.size > maxBytes)
    throw new Error(`Invalid cache file size: ${path}`);
  const data = await readFile(path);
  if (data.length > maxBytes)
    throw new Error(`Invalid cache file size: ${path}`);
  return data;
}

async function download(
  url: string,
  limit: number,
  signal: AbortSignal,
): Promise<Buffer> {
  const response = await fetch(url, { signal });
  if (!response.ok || !response.body)
    throw new Error(`Download ${url}: HTTP ${response.status}`);
  const length = response.headers.get("content-length");
  if (length && Number(length) > limit)
    throw new Error(`Download ${url}: size limit exceeded`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > limit) throw new Error(`Download ${url}: size limit exceeded`);
      chunks.push(item.value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks, size);
}

export function createDn42Intel(options: Dn42IntelOptions): Dn42Intel {
  let enabled = false;
  let disposed = false;
  let generation = 0;
  let pair: Pair | undefined;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;
  const baseUrl = options.baseUrl ?? DEFAULT_URL;

  const active = (version: number) =>
    enabled && !disposed && generation === version;
  const schedule = (version: number, delay: number) => {
    if (!active(version)) return;
    timer = setTimeout(() => {
      void refresh().catch(() => {});
    }, delay);
    timer.unref();
  };

  async function loadCache(version: number): Promise<string | undefined> {
    let pointerBytes: Buffer;
    try {
      pointerBytes = await readBounded(
        join(options.cacheDir, "current.json"),
        MAX_CHECKSUM_BYTES,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    const pointer = pointerSchema.parse(
      JSON.parse(pointerBytes.toString("utf8")),
    );
    if (pair) return pointer.version;
    const dir = join(options.cacheDir, pointer.version);
    const [city, asn] = await Promise.all([
      readBounded(join(dir, "city.mmdb"), MAX_DB_BYTES),
      readBounded(join(dir, "asn.mmdb"), MAX_DB_BYTES),
    ]);
    const loaded = verifyPair(city, asn, pointer.checksums);
    if (active(version) && !pair) {
      pair = loaded;
      options.onUpdate?.();
    }
    return pointer.version;
  }

  async function update(
    version: number,
    signal: AbortSignal,
    previousVersion: string | undefined,
  ): Promise<void> {
    const checksumBytes = await download(
      new URL("checksums.json", baseUrl).href,
      MAX_CHECKSUM_BYTES,
      signal,
    );
    const checksums = checksumsSchema.parse(
      JSON.parse(checksumBytes.toString("utf8")),
    );
    signal.throwIfAborted();
    if (!active(version)) return;
    if (
      pair &&
      pair.checksums["city.mmdb"] === checksums["city.mmdb"] &&
      pair.checksums["asn.mmdb"] === checksums["asn.mmdb"]
    )
      return;
    const [city, asn] = await Promise.all([
      download(new URL("city.mmdb", baseUrl).href, MAX_DB_BYTES, signal),
      download(new URL("asn.mmdb", baseUrl).href, MAX_DB_BYTES, signal),
    ]);
    const loaded = verifyPair(city, asn, checksums);
    signal.throwIfAborted();
    if (!active(version)) return;
    const versionId = hash(Buffer.from(randomUUID()));
    const stage = join(options.cacheDir, `.stage-${randomUUID()}`);
    const destination = join(options.cacheDir, versionId);
    await mkdir(stage, { recursive: true });
    try {
      await Promise.all([
        writeFile(join(stage, "city.mmdb"), city),
        writeFile(join(stage, "asn.mmdb"), asn),
      ]);
      const pending = join(options.cacheDir, `.current-${randomUUID()}`);
      try {
        await writeFile(
          pending,
          JSON.stringify({ version: versionId, checksums }),
        );
        signal.throwIfAborted();
        if (!active(version)) return;
        renameSync(stage, destination);
        renameSync(pending, join(options.cacheDir, "current.json"));
        pair = loaded;
        options.onUpdate?.();
        if (!active(version) || signal.aborted) return;
        for (const entry of readdirSync(options.cacheDir, {
          withFileTypes: true,
        })) {
          if (
            !entry.isDirectory() ||
            !/^[0-9a-f]{64}$/.test(entry.name) ||
            entry.name === versionId ||
            entry.name === previousVersion
          )
            continue;
          const dir = join(options.cacheDir, entry.name);
          const files = readdirSync(dir, { withFileTypes: true });
          if (
            files.length === 2 &&
            files.every(
              (file) =>
                file.isFile() &&
                (file.name === "city.mmdb" || file.name === "asn.mmdb"),
            )
          )
            rmSync(dir, { recursive: true });
        }
      } finally {
        await rm(pending, { force: true });
      }
    } finally {
      await rm(stage, { recursive: true, force: true });
    }
  }

  function refresh(): Promise<void> {
    if (!enabled || disposed) return Promise.resolve();
    if (inFlight) return inFlight;
    if (timer) clearTimeout(timer);
    const version = generation;
    const request = new AbortController();
    controller = request;
    const timeout = setTimeout(
      () => request.abort(new Error("DN42 update timed out")),
      TIMEOUT,
    );
    let task!: Promise<void>;
    task = (async () => {
      let delay = CHECK_INTERVAL;
      try {
        await mkdir(options.cacheDir, { recursive: true });
        request.signal.throwIfAborted();
        const release = await lock(options.cacheDir, {
          lockfilePath: join(options.cacheDir, ".update.lock"),
          retries: 0,
          onCompromised: (error) => request.abort(error),
        });
        try {
          request.signal.throwIfAborted();
          let previousVersion: string | undefined;
          try {
            previousVersion = await loadCache(version);
          } catch (error) {
            if (active(version))
              options.onError?.(
                error instanceof Error ? error : new Error(String(error)),
              );
          }
          request.signal.throwIfAborted();
          if (active(version))
            await update(version, request.signal, previousVersion);
        } finally {
          await release();
        }
      } catch (error) {
        request.abort();
        if (active(version)) {
          delay =
            (error as NodeJS.ErrnoException).code === "ELOCKED"
              ? LOCK_RETRY_INTERVAL
              : RETRY_INTERVAL;
          const failure =
            error instanceof Error ? error : new Error(String(error));
          options.onError?.(failure);
          throw failure;
        }
      } finally {
        clearTimeout(timeout);
        if (controller === request) controller = undefined;
        if (inFlight === task) inFlight = undefined;
        schedule(version, delay);
      }
    })();
    inFlight = task;
    return task;
  }

  function setEnabled(value: boolean): void {
    if (disposed || value === enabled) return;
    enabled = value;
    generation++;
    if (!value) {
      controller?.abort();
      if (timer) clearTimeout(timer);
      inFlight = undefined;
      pair = undefined;
      return;
    }
    void refresh().catch(() => {});
  }

  return {
    setEnabled,
    lookup(ip) {
      if (!enabled || !pair || !isIP(ip)) return undefined;
      const city = pair.city.get(ip);
      const asn = pair.asn.get(ip);
      if (!city && !asn) return undefined;
      const info: Dn42IpInfo = {
        asn: asn?.autonomous_system_number,
        asName: asn?.autonomous_system_organization,
        country: city?.country?.iso_code,
        region: city?.subdivisions?.[0]?.iso_code,
        city: city?.city?.names?.en,
      };
      return Object.values(info).some(
        (value) => value !== undefined && value !== "",
      )
        ? info
        : undefined;
    },
    refresh,
    dispose() {
      setEnabled(false);
      disposed = true;
    },
  };
}
