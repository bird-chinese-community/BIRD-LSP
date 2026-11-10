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
  expect(hover).toMatch(/^### 172\.20\.0\.53\n/);
  expect(hover).toContain("AS4242420001 · TestNetwork");
  expect(hover).toContain("Network 172.20.0.53/32");
  expect(hover).toContain("Tokyo, Japan");
  expect(hover).toContain("*Source: DN42 IPDB*");
  expect(hover).toContain("ROA `✓ Valid`");
  expect(hover).toContain(
    "*DN42 registry*  \nROA `✓ Valid` · IRR `↳ Covering`  \nPolicy for both: 172.20.0.0/24",
  );
  expect(hover.match(/DN42 registry/g)).toHaveLength(1);
  expect(hover).toContain("IRR `↳ Covering`");
  expect(hover).not.toContain("Policy for both: 172.20.0.53/32");
  expect(hover).not.toContain("PTR:");
  expect(hover.indexOf("Tokyo, Japan")).toBeLessThan(
    hover.indexOf("AS4242420001"),
  );
  expect(hover.indexOf("IRR `↳ Covering`")).toBeLessThan(
    hover.indexOf("\n---\n"),
  );
  expect(hover.indexOf("Source: DN42 IPDB")).toBeGreaterThan(
    hover.indexOf("\n---\n"),
  );
});

it("groups service conclusions and keeps BGP path hints in the evidence section", () => {
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
    .find((line) => line.startsWith("**Public DNS resolver"));
  expect(services?.trim()).toMatch(
    /^\*\*Public DNS resolver\*\* .*Anycast `Published`$/,
  );
  expect(services).toContain("`Published`");
  expect(services).not.toContain("Tunnel");
  const hints = hover.split("\n").find((line) => line.startsWith("BGP path:"));
  expect(hints).toContain("Tunnel · IXP · Centralized VIX");
  expect(hints).not.toContain("Public DNS resolver");
  expect(hover.match(/Anycast/g)).toHaveLength(1);
  expect(hover).not.toContain("bgp-path-");
  expect(hover).not.toContain("public-resolver");
});

it("keeps distinct ROA and IRR policy prefixes on their own status lines", () => {
  const hover = decodeHTML(
    formatDn42IpHover({
      ...info,
      dn42: { ...info.dn42!, irr_prefix: "172.20.0.0/16" },
    }),
  );
  expect(hover).toContain(
    "*DN42 registry*  \nROA `✓ Valid` · 172.20.0.0/24  \nIRR `↳ Covering` · 172.20.0.0/16",
  );
  expect(hover).not.toContain("Policy for both");
});

it("labels registration separately from a GeoFeed location", () => {
  const hover = decodeHTML(
    formatDn42IpHover({
      ...info,
      city: "Tokyo",
      registeredCountry: "DE",
      registeredCountryName: "Germany",
      dn42: { ...info.dn42!, confidence: "geofeed" },
    }),
  );
  expect(hover).toContain("Tokyo, Japan");
  expect(hover.match(/Tokyo/g)).toHaveLength(1);
  expect(hover).toContain("*GeoFeed location*");
  expect(hover).toContain("**⌖ Tokyo, Japan**");
  expect(hover).toContain("Registered in Germany");
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
  expect(hover).toContain("Registered in Germany");
  expect(hover).not.toContain("GeoFeed location");
  expect(hover).not.toContain("⌖");
  expect(hover).not.toContain("Tokyo");
  expect(hover.match(/Germany/g)).toHaveLength(1);
});

it("prioritizes GeoFeed withholding over residual location fields", () => {
  const hover = decodeHTML(
    formatDn42IpHover({
      ...info,
      city: "Private city",
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
  expect(hover).toContain("Registered in Germany");
  expect(hover).not.toContain("*GeoFeed location*");
  expect(hover).not.toContain("Private city");
  expect(hover).not.toContain("Tokyo");
  expect(hover).not.toContain("Japan");
  expect(hover).not.toContain("Location not recorded");
  expect(hover).not.toContain("⌖");
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
  expect(hover).toContain("ROA `? Unknown`");
  expect(hover).toContain("IRR `? Unknown`");
  expect(hover).not.toContain("Anycast");
  expect(hover).not.toContain("Unicast");
  expect(hover).not.toContain("Public DNS resolver");
  expect(hover).not.toContain("PTR:");
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
    expect(hover).toContain(`PTR: ${label}`);
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
          observation({
            kind: "roa",
            status: "invalid",
            asn: 4242420099,
            target: "172.20.9.0/24",
          }),
        ],
      },
    }),
  );
  expect(hover).toContain("ROA `? Unknown`");
  expect(hover).toContain("IRR `? Unknown`");
  expect(hover).toContain("**Origin observations**");
  expect(hover).toContain("- IRR `! Conflict` · 172.20.0.53/32 · AS4242422189");
  expect(hover).toContain("- ROA `! Invalid` · 172.20.0.0/24 · AS4242422601");
  expect(hover.indexOf("- ROA `! Invalid`")).toBeLessThan(
    hover.indexOf("\n---\n"),
  );
  expect(hover).toMatch(/\*1 more observations?\*/);
  expect(hover).not.toContain("172.20.9.0/24");
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
  expect(hover).toMatch(/^### AS4242420001\n/);
  expect(hover).toContain("TestNetwork");
  expect(hover).toContain("Registered in Germany");
  expect(hover).toContain("BGP path on members: Tunnel");
  expect(hover).toContain("**Member observations**");
  expect(hover).toContain("- Public DNS resolver `Observed` · 172.20.0.53");
  expect(hover).toContain("- Anycast `Published` · 172.20.0.53");
  expect(hover).toContain(
    "**Member policy** · *DN42 registry*\n\n- ROA `✓ Valid`",
  );
  expect(hover.match(/DN42 registry/g)).toHaveLength(1);
  expect(hover.indexOf("**Member policy**")).toBeLessThan(
    hover.indexOf("Registered in Germany"),
  );
  expect(hover).toContain(
    "- ROA `✓ Valid` · 172.20.0.53/32 · policy 172.20.0.0/24",
  );
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
  expect(hover).toContain("- ROA `! Invalid` · 172.20.3.0/24 · AS4242420099");
  expect(hover).toContain("- IRR `! Conflict` · 172.20.4.0/24");
  expect(hover).not.toContain("172.20.1.0/24");
  expect(hover).not.toContain("172.20.2.0/24");
});

it("reports remaining member observations and prefixes without expanding the lists", () => {
  const hover = decodeHTML(
    formatDn42AsnHover({
      ...asnInfo,
      prefixes: [
        "172.20.0.0/24",
        "172.20.1.0/24",
        "172.20.2.0/24",
        "172.20.3.0/24",
      ],
      observations: [53, 54, 55, 56, 57].map((host) =>
        observation({ target: `172.20.0.${host}`, value: "public-resolver" }),
      ),
    }),
  );
  expect(hover).toContain("**4 prefixes**");
  expect(hover).toContain("*2 more prefixes*");
  expect(hover).toContain("*3 more observations*");
  expect(hover.match(/^- Public DNS resolver `Observed`/gm)).toHaveLength(2);
  expect(hover).toContain("172.20.0.53");
  expect(hover).toContain("172.20.0.54");
  expect(hover).not.toContain("172.20.0.55");
  expect(hover).not.toContain("172.20.2.0/24");
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
      roa_status: hostile,
      irr_prefix: hostile,
      observations: [
        observation({ kind: "roa", status: "invalid", target: hostile }),
      ],
    },
  });
  expect(decodeHTML(hover)).toMatch(/^### 172\.20\.0\.53\n/);
  expect(hover).toContain("AS4242420001");
  expect(hover).toContain(encodeHTML(normalizedHostile));
  expect(decodeHTML(hover)).toContain(normalizedHostile);
  expect(hover).not.toContain("command:");
  expect(hover).not.toContain("<img");
  expect(hover).not.toContain("`code`");
  expect(hover).not.toContain("*bold*");
  expect(hover).not.toContain("\n# injected");
  expect(hover).not.toContain(`\`${encodeHTML(normalizedHostile)}\``);
  expect(hover).toContain(`ROA ${encodeHTML(normalizedHostile)}`);
  const tableRows = hover.split("\n").filter((line) => line.startsWith("|"));
  expect(tableRows).toHaveLength(0);
  expect(hover).not.toContain("| cell |");
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
  expect(hover).toMatch(/^### AS4242420001\n/);
  expect(hover).toContain("**Member observations**");
  expect(hover).toContain(encodeHTML(normalizedHostile));
  expect(decodeHTML(hover)).toContain(normalizedHostile);
  expect(hover).not.toContain("command:");
  expect(hover).not.toContain("<img");
  expect(hover).not.toContain("`code`");
  expect(hover).not.toContain("*bold*");
  expect(hover).not.toContain("\n# injected");
  expect(hover).not.toContain(`\`${encodeHTML(normalizedHostile)}\``);
  const tableRows = hover.split("\n").filter((line) => line.startsWith("|"));
  expect(tableRows).toHaveLength(0);
  expect(hover).not.toContain("| cell |");
});
