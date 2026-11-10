import { isIP } from "node:net";
import {
  downloadRelease,
  openCachedBundle,
  type AsnInfo,
  type Bundle,
  type Dn42Metadata,
} from "@birdcc/dn42-ipdb";

const CHECK_INTERVAL = 24 * 60 * 60 * 1000;
const RETRY_INTERVAL = 60 * 60 * 1000;
const LOCK_RETRY_INTERVAL = 30_000;

export interface Dn42IpInfo {
  ip: string;
  asn?: number;
  asName?: string;
  country?: string;
  countryName?: string;
  registeredCountry?: string;
  registeredCountryName?: string;
  region?: string;
  regionName?: string;
  city?: string;
  prefix?: string;
  connectionType?: string;
  dn42?: Dn42Metadata;
}

export type Dn42AsnInfo = AsnInfo;

export interface Dn42IntelOptions {
  cacheDir: string;
  onError?: (error: Error) => void;
  baseUrl?: string;
}

export interface Dn42Intel {
  setEnabled(enabled: boolean): void;
  lookup(ip: string): Dn42IpInfo | undefined;
  lookupAsn(asn: number): Dn42AsnInfo | undefined;
  refresh(): Promise<void>;
  dispose(): void;
}

export function createDn42Intel(options: Dn42IntelOptions): Dn42Intel {
  let enabled = false;
  let disposed = false;
  let generation = 0;
  let bundle: Bundle | undefined;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;

  const active = (version: number) =>
    enabled && !disposed && generation === version;
  const report = (error: Error): void => options.onError?.(error);
  const schedule = (version: number, delay: number) => {
    if (!active(version)) return;
    timer = setTimeout(() => {
      void refresh().catch(() => {});
    }, delay);
    timer.unref();
  };

  async function loadCache(version: number): Promise<void> {
    const loaded = await openCachedBundle(options.cacheDir);
    if (!active(version)) {
      loaded.close();
      return;
    }
    bundle?.close();
    bundle = loaded;
  }

  function refresh(): Promise<void> {
    if (!enabled || disposed) return Promise.resolve();
    if (inFlight) return inFlight;
    if (timer) clearTimeout(timer);
    const version = generation;
    const request = new AbortController();
    controller = request;
    let task!: Promise<void>;
    task = (async () => {
      let delay = CHECK_INTERVAL;
      try {
        if (!bundle) {
          try {
            await loadCache(version);
          } catch (error) {
            const failure = error as NodeJS.ErrnoException;
            if (failure.code === "ELOCKED") throw error;
            if (failure.code !== "ENOENT" && active(version))
              report(
                new Error(`Opening DN42 cache failed: ${failure.message}`, {
                  cause: error,
                }),
              );
          }
        }
        request.signal.throwIfAborted();
        const result = await downloadRelease({
          cacheDir: options.cacheDir,
          baseURL: options.baseUrl,
          signal: request.signal,
          timeoutMs: 30_000,
        });
        request.signal.throwIfAborted();
        if (active(version) && (result.changed || !bundle))
          await loadCache(version);
      } catch (error) {
        request.abort();
        if (active(version)) {
          delay =
            (error as NodeJS.ErrnoException).code === "ELOCKED"
              ? LOCK_RETRY_INTERVAL
              : RETRY_INTERVAL;
          const failure = new Error(
            `Updating DN42 IPDB failed: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
          report(failure);
          throw failure;
        }
      } finally {
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
      bundle?.close();
      bundle = undefined;
      return;
    }
    void refresh().catch(() => {});
  }

  return {
    setEnabled,
    lookup(ip) {
      if (!enabled || !bundle || !isIP(ip) || ip.includes("%"))
        return undefined;
      const { records } = bundle.lookup(ip);
      if (!Object.keys(records).length) return undefined;
      const city = records.city?.data;
      const country = city?.country ?? records.country?.data.country;
      const registeredCountry =
        city?.registered_country ?? records.country?.data.registered_country;
      const asn = records.asn?.data;
      const dn42 =
        city?.dn42 ??
        asn?.dn42 ??
        records.country?.data.dn42 ??
        records.connection_type?.data.dn42;
      return {
        ip,
        asn: asn?.autonomous_system_number ?? dn42?.asn,
        asName: asn?.autonomous_system_organization ?? dn42?.as_name,
        country: country?.iso_code,
        countryName: country?.names?.en,
        registeredCountry: registeredCountry?.iso_code,
        registeredCountryName: registeredCountry?.names?.en,
        region: city?.subdivisions?.[0]?.iso_code,
        regionName: city?.subdivisions?.[0]?.names?.en,
        city: city?.city?.names?.en,
        prefix: dn42?.prefix,
        connectionType: records.connection_type?.data.connection_type,
        dn42,
      };
    },
    lookupAsn(asn) {
      if (
        !enabled ||
        !bundle ||
        !Number.isSafeInteger(asn) ||
        asn <= 0 ||
        asn > 4_294_967_295
      )
        return undefined;
      return bundle.lookupAsn(asn);
    },
    refresh,
    dispose() {
      setEnabled(false);
      disposed = true;
    },
  };
}
