import { expect, it } from "vitest";
import type { Dn42AsnInfo, Dn42IpInfo } from "@birdcc/intel";
import { decodeHTML, encodeHTML } from "entities";
import { formatDn42AsnHover, formatDn42IpHover } from "../src/dn42-hover.js";

type Observation = NonNullable<Dn42IpInfo["dn42"]>["observations"][number];

const observation = (values: Partial<Observation>): Observation => ({
  target: "172.20.0.53",
  kind: "network_type",
  status: "observed",
  method: "dns-query",
  source: "dns://172.20.0.53:53",
  authority: "dns-response",
  observed_at: "2026-11-10T00:00:00Z",
  ...values,
});

const info: Dn42IpInfo = {
  ip: "172.20.0.53",
  prefix: "172.20.0.53/32",
  asn: 4242420001,
  asName: "TestNetwork",
  country: "JP",
  countryName: "Japan",
  region: "13",
  regionName: "Tokyo",
  dn42: {
    schema_version: "2",
    prefix: "172.20.0.53/32",
    anycast: "published",
    network_types: ["anycast", "public-resolver"],
    ptr: [],
    roa_status: "valid",
    roa_prefix: "172.20.0.0/24",
    irr_status: "covering",
    irr_prefix: "172.20.0.0/24",
    observations: [],
    evidence: [],
  },
};

const asnInfo: Dn42AsnInfo = {
  asn: 4242420001,
  as_name: "TestNetwork",
  prefixes: ["172.20.0.0/24"],
  registered_countries: [{ iso_code: "DE", names: { en: "Germany" } }],
  observed_network_types: ["public-resolver"],
  observations: [],
};

it("separates the queried host, its matched record and registry policy prefixes", () => {
  const hover = decodeHTML(formatDn42IpHover(info));
  expect(hover).toMatch(/^\*\*172\.20\.0\.53\*\* · DN42 IPDB/);
  expect(hover).toContain("**AS4242420001** · TestNetwork");
  expect(hover).toContain("**Matched network** 172.20.0.53/32");
  expect(hover).toContain("Tokyo, Japan");
  expect(hover).toContain("**DN42 registry policy**");
  expect(hover).toContain("**ROA** Valid · 172.20.0.0/24");
  expect(hover).toContain("**IRR** Covering · 172.20.0.0/24");
  expect(hover).not.toContain("**ROA** Valid · 172.20.0.53/32");
  expect(hover).not.toContain("**PTR**");
});

it("uses friendly service badges and keeps BGP path hints on a separate line", () => {
  const hover = decodeHTML(
    formatDn42IpHover({
      ...info,
      dn42: {
        ...info.dn42!,
        network_types: [
          "anycast",
          "public-resolver",
          "bgp-path-tunnel",
          "bgp-path-ixp",
          "bgp-path-centralized-vix",
        ],
      },
    }),
  );
  const services = hover
    .split("\n")
    .find((line) => line.includes("`Public DNS resolver`"));
  expect(services).toContain("`Anycast · published`");
  expect(services).not.toContain("Tunnel");
  const hints = hover
    .split("\n")
    .find((line) => line.startsWith("**BGP path hints**"));
  expect(hints).toContain("Tunnel · IXP · Centralized VIX");
  expect(hints).not.toContain("Public DNS resolver");
  expect(hover.match(/Anycast/g)).toHaveLength(1);
  expect(hover).not.toContain("bgp-path-");
  expect(hover).not.toContain("public-resolver");
});

it("labels registration separately from a GeoFeed location", () => {
  const hover = decodeHTML(
    formatDn42IpHover({
      ...info,
      registeredCountry: "DE",
      registeredCountryName: "Germany",
      dn42: { ...info.dn42!, confidence: "geofeed" },
    }),
  );
  expect(hover).toContain("Tokyo, Japan");
  expect(hover).toContain("*GeoFeed location*");
  expect(hover).toContain("**Registered in** Germany");
  expect(hover).not.toContain("Tokyo, Germany");
});

it("does not present a registration-only country as a location", () => {
  const hover = decodeHTML(
    formatDn42IpHover({
      ip: info.ip,
      registeredCountry: "DE",
      registeredCountryName: "Germany",
      dn42: { ...info.dn42!, confidence: "registry" },
    }),
  );
  expect(hover).toContain("**Registered in** Germany");
  expect(hover).not.toContain("GeoFeed location");
  expect(hover).not.toContain("Tokyo");
  expect(hover.match(/Germany/g)).toHaveLength(1);
});

it("recognizes real GeoFeed withholding evidence alongside registration", () => {
  const hover = decodeHTML(
    formatDn42IpHover({
      ip: info.ip,
      registeredCountry: "DE",
      registeredCountryName: "Germany",
      dn42: {
        ...info.dn42!,
        confidence: "geofeed",
        evidence: [
          {
            kind: "geofeed-withheld",
            source: "https://example.org/geofeed.csv",
            observed_at: "2026-11-10T00:00:00Z",
            authority: "data/inetnum/172.20.0.0_24",
            confidence: "geofeed",
          },
        ],
      },
    }),
  );
  expect(hover).toContain("*Location withheld by GeoFeed*");
  expect(hover).toContain("**Registered in** Germany");
  expect(hover).not.toContain("*GeoFeed location*");
  expect(hover).not.toContain("Location not recorded");
});

it("keeps unknown policy and location states explicit without inventing service roles", () => {
  const hover = decodeHTML(
    formatDn42IpHover({
      ip: info.ip,
      dn42: {
        ...info.dn42!,
        anycast: "unknown",
        network_types: [],
        roa_status: "unknown",
        roa_prefix: undefined,
        irr_status: "unknown",
        irr_prefix: undefined,
      },
    }),
  );
  expect(hover).toContain("Location not recorded");
  expect(hover).toContain("**ROA** Unknown");
  expect(hover).toContain("**IRR** Unknown");
  expect(hover).not.toContain("Anycast");
  expect(hover).not.toContain("Unicast");
  expect(hover).not.toContain("Public DNS resolver");
  expect(hover).not.toContain("**PTR**");
});

it.each([
  ["nxdomain", "NXDOMAIN (observed)"],
  ["unknown", "Unknown (lookup inconclusive)"],
])(
  "distinguishes a recorded PTR %s result from an absent lookup",
  (result, label) => {
    const hover = decodeHTML(
      formatDn42IpHover({
        ...info,
        dn42: {
          ...info.dn42!,
          observations: [observation({ kind: "ptr", status: result })],
        },
      }),
    );
    expect(hover).toContain(`**PTR** ${label}`);
    if (result === "unknown") expect(hover).not.toContain("NXDOMAIN");
  },
);

it("retains per-origin policy failures when aggregate status is unknown", () => {
  const hover = decodeHTML(
    formatDn42IpHover({
      ...info,
      dn42: {
        ...info.dn42!,
        roa_status: "unknown",
        roa_prefix: undefined,
        irr_status: "unknown",
        irr_prefix: undefined,
        observations: [
          observation({
            kind: "irr",
            status: "conflict",
            asn: 4242422189,
            target: "172.20.0.53/32",
          }),
          observation({
            kind: "roa",
            status: "invalid",
            asn: 4242422601,
            target: "172.20.0.0/24",
          }),
        ],
      },
    }),
  );
  expect(hover).toContain("**ROA** Unknown");
  expect(hover).toContain("**IRR** Unknown");
  expect(hover).toContain("**Origin policy observations**");
  expect(hover).toContain("AS4242422189 · IRR Conflict · 172.20.0.53/32");
  expect(hover).toContain("AS4242422601 · ROA Invalid · 172.20.0.0/24");
});

it("keeps service and policy observations attached to their ASN member targets", () => {
  const hover = decodeHTML(
    formatDn42AsnHover({
      ...asnInfo,
      observed_network_types: ["public-resolver", "bgp-path-tunnel"],
      observations: [
        observation({ value: "public-resolver" }),
        observation({
          kind: "network_type",
          value: "anycast",
          status: "published",
          method: "published-service",
          authority: "service-documentation",
        }),
        observation({
          kind: "roa",
          target: "172.20.0.53/32",
          value: "172.20.0.0/24",
          status: "valid",
        }),
      ],
    }),
  );
  expect(hover).toMatch(/^\*\*AS4242420001\*\*/);
  expect(hover).toContain("TestNetwork");
  expect(hover).toContain("**Registered in** Germany");
  expect(hover).toContain("**BGP path hints on members** Tunnel");
  expect(hover).toContain("**Member observations**");
  expect(hover).toContain("172.20.0.53 · **Public DNS resolver** Observed");
  expect(hover).toContain("172.20.0.53 · **Anycast** Published");
  expect(hover).toContain(
    "172.20.0.53/32 · **ROA** Valid · policy 172.20.0.0/24",
  );
  expect(hover).toContain("Policy observations use DN42 registry objects");
  expect(hover).not.toContain("network_type");
  expect(hover).not.toContain("public-resolver");
});

it("selects failed ASN policy samples ahead of earlier successful members", () => {
  const hover = decodeHTML(
    formatDn42AsnHover({
      ...asnInfo,
      observations: [
        observation({
          kind: "roa",
          status: "valid",
          target: "172.20.1.0/24",
        }),
        observation({
          kind: "irr",
          status: "exact",
          target: "172.20.2.0/24",
        }),
        observation({
          kind: "roa",
          status: "invalid",
          target: "172.20.3.0/24",
          asn: 4242420099,
        }),
        observation({
          kind: "irr",
          status: "conflict",
          target: "172.20.4.0/24",
        }),
      ],
    }),
  );
  expect(hover).toContain("172.20.3.0/24 · **ROA** Invalid · AS4242420099");
  expect(hover).toContain("172.20.4.0/24 · **IRR** Conflict");
  expect(hover).not.toContain("172.20.1.0/24 · **ROA** Valid");
  expect(hover).not.toContain("172.20.2.0/24 · **IRR** Exact");
});

const hostile =
  "[open](command:run) <img src=x> `code` *bold*\n\n# injected\n| cell |";
const normalizedHostile = hostile.replace(/\s+/g, " ").trim();

it("escapes dynamic IP data without escaping native Markdown structure", () => {
  const hover = formatDn42IpHover({
    ...info,
    asName: hostile,
    city: hostile,
    countryName: hostile,
    registeredCountry: "DE",
    registeredCountryName: hostile,
    prefix: hostile,
    connectionType: hostile,
    dn42: {
      ...info.dn42!,
      anycast: hostile,
      network_types: [hostile],
      ptr: [hostile],
      roa_prefix: hostile,
      irr_prefix: hostile,
      observations: [
        observation({ kind: "roa", status: "invalid", target: hostile }),
      ],
    },
  });
  expect(hover).toContain("**AS4242420001**");
  expect(hover).toContain(encodeHTML(normalizedHostile));
  expect(decodeHTML(hover)).toContain(normalizedHostile);
  expect(hover).not.toContain("command:");
  expect(hover).not.toContain("<img");
  expect(hover).not.toContain("`code`");
  expect(hover).not.toContain("*bold*");
  expect(hover).not.toContain("\n# injected");
  expect(hover).not.toContain(`\`${encodeHTML(normalizedHostile)}\``);
});

it("escapes dynamic ASN names, countries, prefixes and observation content", () => {
  const hover = formatDn42AsnHover({
    ...asnInfo,
    as_name: hostile,
    registered_countries: [{ iso_code: "DE", names: { en: hostile } }],
    prefixes: [hostile],
    observations: [
      observation({ kind: "ptr", target: hostile, value: hostile }),
      observation({
        kind: "roa",
        target: hostile,
        value: hostile,
        status: "invalid",
      }),
    ],
  });
  expect(hover).toMatch(/^\*\*AS4242420001\*\*/);
  expect(hover).toContain("**Member observations**");
  expect(hover).toContain(encodeHTML(normalizedHostile));
  expect(decodeHTML(hover)).toContain(normalizedHostile);
  expect(hover).not.toContain("command:");
  expect(hover).not.toContain("<img");
  expect(hover).not.toContain("`code`");
  expect(hover).not.toContain("*bold*");
  expect(hover).not.toContain("\n# injected");
  expect(hover).not.toContain(`\`${encodeHTML(normalizedHostile)}\``);
});
