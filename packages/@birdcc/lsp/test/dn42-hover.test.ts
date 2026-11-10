import { describe, expect, it } from "vitest";
import { marked } from "marked";
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import type { Dn42AsnInfo, Dn42IpInfo } from "@birdcc/intel";
import {
  formatDn42AsnHover,
  formatDn42IpHover,
  type Dn42HoverMarkup,
} from "../src/dn42-hover.js";

type Observation = NonNullable<Dn42IpInfo["dn42"]>["observations"][number];
type Node = DefaultTreeAdapterMap["childNode"];
type Element = DefaultTreeAdapterMap["element"];

// Tags that vscode-languageclient 9 advertises with markdown.supportHtml.
const clientTags = new Set([
  "ul",
  "li",
  "p",
  "code",
  "blockquote",
  "ol",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "em",
  "pre",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "div",
  "del",
  "a",
  "strong",
  "br",
  "img",
  "span",
]);
// Attribute rules from VS Code's markdown sanitizer.
const styleRule =
  /^(color:(#[0-9a-fA-F]+|var\(--vscode(-[a-zA-Z0-9]+)+\));)?(background-color:(#[0-9a-fA-F]+|var\(--vscode(-[a-zA-Z0-9]+)+\));)?(border-radius:[0-9]+px;)?$/;
const classRule = /^codicon codicon-[a-z-]+( codicon-modifier-[a-z-]+)?$/;

const render = (markdown: string): Node[] =>
  parseFragment(marked.parse(markdown, { async: false })).childNodes;
const elements = (nodes: Node[]): Element[] =>
  nodes.flatMap((node) =>
    "tagName" in node ? [node, ...elements(node.childNodes)] : [],
  );
const blockTags = new Set(["br", "h3", "hr", "p", "td", "tr"]);
const textOf = (node: Node): string => {
  if (node.nodeName === "#text" && "value" in node) return node.value;
  if (!("tagName" in node)) return "";
  const inner = node.childNodes.map(textOf).join("");
  return blockTags.has(node.tagName) ? ` ${inner} ` : inner;
};
const squash = (value: string): string => value.replace(/\s+/g, " ").trim();
const pageText = (nodes: Node[]): string => squash(nodes.map(textOf).join(" "));
const sheet = (nodes: Node[]): string[][] =>
  elements(nodes)
    .filter((element) => element.tagName === "tr")
    .map((row) =>
      elements(row.childNodes)
        .filter((cell) => cell.tagName === "td")
        .map((cell) => squash(textOf(cell))),
    );
const icons = (nodes: Node[]): string[] =>
  elements(nodes).flatMap((element) =>
    element.attrs
      .filter((attribute) => attribute.name === "class")
      .map((attribute) => attribute.value.replace("codicon codicon-", "")),
  );

const expectSanitizerSafe = (nodes: Node[]): void => {
  for (const element of elements(nodes)) {
    expect(clientTags).toContain(element.tagName);
    expect(["a", "img"]).not.toContain(element.tagName);
    for (const attribute of element.attrs) {
      expect(element.tagName).toBe("span");
      expect(attribute.value).toMatch(
        attribute.name === "style" ? styleRule : classRule,
      );
    }
  }
};

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

const markups: Dn42HoverMarkup[] = ["html", "markdown"];

describe.each(markups)("%s form", (markup) => {
  const ip = (value: Dn42IpInfo): Node[] =>
    render(formatDn42IpHover(value, markup));
  const asn = (value: Dn42AsnInfo): Node[] =>
    render(formatDn42AsnHover(value, markup));

  it("leads with the address, owner and roles before the property sheet", () => {
    const nodes = ip(info);
    expectSanitizerSafe(nodes);
    const heading = elements(nodes).find((element) => element.tagName === "h3");
    expect(squash(textOf(heading!))).toBe("172.20.0.53");
    const text = pageText(nodes);
    expect(text).toMatch(
      /^172\.20\.0\.53 TestNetwork AS4242420001 Public DNS resolver Anycast published /,
    );
    expect(text.indexOf("Location")).toBeGreaterThan(text.indexOf("Anycast"));
    expect(text).toMatch(
      / Location (⌖ )?Tokyo, Japan Network 172\.20\.0\.53\/32 ROA (✓ )?Valid 172\.20\.0\.0\/24 IRR (↳ )?Covering 172\.20\.0\.0\/24 DN42 IPDB · registry data$/,
    );
    expect(text).not.toContain("PTR");
    if (markup === "html") {
      expect(icons(nodes)).toEqual([
        "globe",
        "location",
        "pass-filled",
        "pass",
      ]);
      expect(sheet(nodes)).toEqual([
        ["Location", "Tokyo, Japan"],
        ["Network", "172.20.0.53/32"],
        ["ROA", "Valid 172.20.0.0/24"],
        ["IRR", "Covering 172.20.0.0/24"],
      ]);
    }
  });

  it("keeps BGP path hints and service roles in separate places", () => {
    const text = pageText(
      ip({
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
    expect(text).toContain("BGP path Tunnel, IXP, Centralized VIX");
    expect(text.match(/Anycast/g)).toHaveLength(1);
    expect(text).not.toContain("bgp-path-");
    expect(text).not.toContain("public-resolver");
  });

  it("shows each registry policy with its own scope", () => {
    const text = pageText(
      ip({ ...info, dn42: { ...info.dn42!, irr_prefix: "172.20.0.0/16" } }),
    );
    expect(text).toMatch(/ROA (✓ )?Valid 172\.20\.0\.0\/24/);
    expect(text).toMatch(/IRR (↳ )?Covering 172\.20\.0\.0\/16/);
  });

  it("labels registration separately from a GeoFeed location", () => {
    const text = pageText(
      ip({
        ...info,
        city: "Tokyo",
        registeredCountry: "DE",
        registeredCountryName: "Germany",
        dn42: { ...info.dn42!, confidence: "geofeed" },
      }),
    );
    expect(text).toMatch(/Location (⌖ )?Tokyo, Japan GeoFeed/);
    expect(text.match(/Tokyo/g)).toHaveLength(1);
    expect(text).toContain("Registered Germany");
  });

  it("does not present a registration-only country as a location", () => {
    const text = pageText(
      ip({
        ip: info.ip,
        registeredCountry: "DE",
        registeredCountryName: "Germany",
        dn42: { ...info.dn42!, confidence: "registry" },
      }),
    );
    expect(text).toContain("Registered Germany");
    expect(text).not.toContain("Location");
    expect(text).not.toContain("GeoFeed");
    expect(text.match(/Germany/g)).toHaveLength(1);
  });

  it("prioritizes GeoFeed withholding over residual location fields", () => {
    const nodes = ip({
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
    });
    const text = pageText(nodes);
    expect(text).toContain("Location Withheld by GeoFeed");
    expect(text).toContain("Registered Germany");
    for (const hidden of ["Private city", "Tokyo", "Japan", "Not recorded"])
      expect(text).not.toContain(hidden);
    if (markup === "html") expect(icons(nodes)).toContain("eye-closed");
  });

  it("keeps unknown policy and location states explicit", () => {
    const text = pageText(
      ip({
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
    expect(text).toContain("Location Not recorded");
    expect(text).toMatch(/ROA (\? )?Unknown IRR (\? )?Unknown/);
    for (const hidden of ["Anycast", "Unicast", "Public DNS resolver", "PTR"])
      expect(text).not.toContain(hidden);
  });

  it.each([
    ["nxdomain", /PTR (⊘ )?NXDOMAIN observed/],
    ["unknown", /PTR (\? )?Unknown lookup inconclusive/],
  ])("distinguishes a recorded PTR %s result", (result, expected) => {
    const text = pageText(
      ip({
        ...info,
        dn42: {
          ...info.dn42!,
          observations: [observation({ kind: "ptr", status: result })],
        },
      }),
    );
    expect(text).toMatch(expected);
  });

  it("lists PTR names and counts the rest", () => {
    const text = pageText(
      ip({
        ...info,
        dn42: {
          ...info.dn42!,
          ptr: ["a.test.dn42", "b.test.dn42", "c.test.dn42"],
        },
      }),
    );
    expect(text).toContain("PTR a.test.dn42 b.test.dn42 1 more");
    expect(text).not.toContain("c.test.dn42");
  });

  it("retains per-origin policy failures when aggregate status is unknown", () => {
    const nodes = ip({
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
    });
    const text = pageText(nodes);
    expect(text).toMatch(
      /Origins IRR (! )?Conflict 172\.20\.0\.53\/32 AS4242422189 ROA (✗ )?Invalid 172\.20\.0\.0\/24 AS4242422601 1 more DN42 IPDB/,
    );
    expect(text).not.toContain("172.20.9.0/24");
    if (markup === "html")
      expect(icons(nodes)).toEqual(
        expect.arrayContaining(["warning", "error", "question"]),
      );
  });

  it("keeps service and policy observations attached to member targets", () => {
    const text = pageText(
      asn({
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
    expect(text).toMatch(/^AS4242420001 TestNetwork Registered Germany /);
    expect(text).toMatch(
      /ROA (✓ )?Valid 172\.20\.0\.53\/32 policy 172\.20\.0\.0\/24 Services/,
    );
    expect(text).toContain(
      "Services Public DNS resolver observed 172.20.0.53 Anycast published 172.20.0.53",
    );
    expect(text).toContain("BGP path Tunnel");
    expect(text).not.toContain("network_type");
    expect(text).not.toContain("public-resolver");
  });

  it("selects failed ASN policy samples ahead of earlier successful members", () => {
    const text = pageText(
      asn({
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
    expect(text).toMatch(/ROA (✗ )?Invalid 172\.20\.3\.0\/24 AS4242420099/);
    expect(text).toMatch(/IRR (! )?Conflict 172\.20\.4\.0\/24/);
    expect(text).not.toContain("172.20.1.0/24");
    expect(text).not.toContain("172.20.2.0/24");
  });

  it("shows member results before a shortened prefix list", () => {
    const text = pageText(
      asn({
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
    expect(text).toContain(
      "Services Public DNS resolver observed 172.20.0.53 Public DNS resolver observed 172.20.0.54 3 more Prefixes 172.20.0.0/24 172.20.1.0/24 2 more DN42 IPDB",
    );
    expect(text).not.toContain("172.20.0.55");
    expect(text).not.toContain("172.20.2.0/24");
  });

  it("states that no member observations exist", () => {
    expect(pageText(asn(asnInfo))).toContain(
      "Services No member observations Prefixes 172.20.0.0/24 DN42 IPDB",
    );
  });
});

const hostile =
  '[open](command:run) <img src="https://example.org/x.png"> `code` *bold* www.example.org\n\n# injected\n| cell |';
const normalizedHostile = hostile.replace(/\s+/g, " ").trim();

describe.each(markups)("%s form with hostile data", (markup) => {
  it("renders every dynamic IP field as inert text", () => {
    const nodes = render(
      formatDn42IpHover(
        {
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
        },
        markup,
      ),
    );
    expectSanitizerSafe(nodes);
    const tags = elements(nodes).map((element) => element.tagName);
    expect(tags.filter((tag) => tag === "h3")).toHaveLength(1);
    expect(tags).not.toContain("h1");
    expect(pageText(nodes)).toContain(normalizedHostile);
  });

  it("renders every dynamic ASN field as inert text", () => {
    const nodes = render(
      formatDn42AsnHover(
        {
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
        },
        markup,
      ),
    );
    expectSanitizerSafe(nodes);
    const tags = elements(nodes).map((element) => element.tagName);
    expect(tags.filter((tag) => tag === "h3")).toHaveLength(1);
    expect(tags).not.toContain("h1");
    expect(pageText(nodes)).toContain(normalizedHostile);
  });
});
