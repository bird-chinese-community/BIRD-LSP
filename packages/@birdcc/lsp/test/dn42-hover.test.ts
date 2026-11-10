import { expect, it } from "vitest";
import type { Dn42IpInfo } from "@birdcc/intel";
import { decodeHTML } from "entities";
import {
  formatDn42AsnHover,
  formatDn42IpHover,
  toDn42HoverMarkdown,
} from "../src/dn42-hover.js";

const info: Dn42IpInfo = {
  ip: "172.20.0.53",
  prefix: "172.20.0.53/32",
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

it("shows the validation authority prefix separately from the host record", () => {
  const hover = formatDn42IpHover(info);
  expect(hover).toContain("IP: 172.20.0.53 · Prefix: 172.20.0.53/32");
  expect(hover).toContain("Tokyo, Japan");
  expect(hover).toContain("ROA policy (DN42 registry): valid · 172.20.0.0/24");
  expect(hover).toContain(
    "IRR (DN42 registry route object): covering · 172.20.0.0/24",
  );
  expect(hover).not.toContain("PTR:");
});

it("escapes Markdown and HTML source text while preserving compact line breaks", () => {
  const text =
    "[open](command:run) <img src=x> `code` *bold*\n[next](https://example.org)";
  const markdown = toDn42HoverMarkdown(text);
  expect(decodeHTML(markdown)).toBe(text.replaceAll("\n", "  \n"));
  expect(markdown).not.toContain("https:");
  expect(markdown).not.toContain("command:");
  expect(markdown).not.toContain("<img");
  expect(markdown).toContain("&lsqb;open&rsqb;");
});

it("shows NXDOMAIN only when an observed PTR result records it", () => {
  const hover = formatDn42IpHover({
    ...info,
    dn42: {
      ...info.dn42!,
      observations: [
        {
          target: info.ip,
          kind: "ptr",
          status: "nxdomain",
          method: "dns-ptr",
          source: "dns://172.20.0.53:53",
          authority: "dns-response",
          observed_at: "2026-11-10T00:00:00Z",
        },
      ],
    },
  });
  expect(hover).toContain("PTR: NXDOMAIN (observed)");
});

it("keeps service observations attached to their member prefix on ASN hover", () => {
  const hover = formatDn42AsnHover({
    asn: 4242420001,
    as_name: "TestNetwork",
    prefixes: ["172.20.0.0/24"],
    registered_countries: [{ iso_code: "DE", names: { en: "Germany" } }],
    observed_network_types: ["public-resolver"],
    observations: [
      {
        target: "172.20.0.53",
        kind: "network_type",
        value: "public-resolver",
        status: "observed",
        method: "dns-query",
        source: "dns://172.20.0.53:53",
        authority: "dns-response",
        observed_at: "2026-11-10T00:00:00Z",
      },
      {
        target: "172.20.0.53/32",
        kind: "roa",
        value: "172.20.0.0/24",
        status: "valid",
        method: "dn42-registry-derived-roa",
        source: "https://example.org/roa.json",
        authority: "registry-derived",
        observed_at: "2026-11-10T00:00:00Z",
      },
    ],
  });
  expect(hover).toContain("Registered countries: Germany");
  expect(hover).toContain("Types observed on member prefixes: public-resolver");
  expect(hover).toContain(
    "172.20.0.53: network_type public-resolver (observed)",
  );
  expect(hover).toContain(
    "172.20.0.53/32: ROA policy (DN42 registry) valid (authority 172.20.0.0/24)",
  );
});
