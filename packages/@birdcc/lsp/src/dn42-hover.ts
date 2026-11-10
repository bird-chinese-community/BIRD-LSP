import type { Dn42AsnInfo, Dn42IpInfo } from "@birdcc/intel";
import { encodeHTML } from "entities";

type Observation = NonNullable<Dn42IpInfo["dn42"]>["observations"][number];

const text = (value: string): string =>
  encodeHTML(value.replace(/\s+/g, " ").trim());

const statuses = new Map([
  ["valid", "Valid"],
  ["invalid", "Invalid"],
  ["unknown", "Unknown"],
  ["exact", "Exact"],
  ["covering", "Covering"],
  ["conflict", "Conflict"],
  ["observed", "Observed"],
  ["advertised", "Advertised"],
  ["published", "Published"],
  ["nxdomain", "NXDOMAIN"],
]);
const statusMarks = new Map([
  ["valid", "✓"],
  ["exact", "✓"],
  ["invalid", "!"],
  ["conflict", "!"],
  ["unknown", "?"],
  ["covering", "↳"],
]);
const statusBadge = (value: string): string => {
  const label = statuses.get(value);
  if (!label) return text(value);
  const mark = statusMarks.get(value);
  return `\`${mark ? `${mark} ` : ""}${label}\``;
};
const pathLabels = new Map([
  ["bgp-path-tunnel", "Tunnel"],
  ["bgp-path-ixp", "IXP"],
  ["bgp-path-centralized-vix", "Centralized VIX"],
]);

const paragraphs = (blocks: (string | undefined)[]): string =>
  blocks.filter(Boolean).join("\n\n");
const lines = (values: (string | undefined)[]): string =>
  values.filter(Boolean).join("  \n");
const policyLine = (label: string, result: string, prefix?: string): string =>
  `${label} ${statusBadge(result)}${prefix ? ` · ${text(prefix)}` : ""}`;
const pathHints = (types: string[]): string[] => [
  ...new Set(
    types.flatMap((type) => {
      const label = pathLabels.get(type);
      return label ? [label] : [];
    }),
  ),
];
const remaining = (
  total: number,
  shown: number,
  noun: readonly [singular: string, plural: string],
): string | undefined =>
  total > shown
    ? `*${total - shown} more ${noun[total - shown === 1 ? 0 : 1]}*`
    : undefined;
const isPolicy = (item: Observation): boolean =>
  item.kind === "roa" || item.kind === "irr";
const isFailedPolicy = (item: Observation): boolean =>
  isPolicy(item) && (item.status === "invalid" || item.status === "conflict");

const observationLabel = (item: Observation): string =>
  item.kind === "network_type"
    ? item.value === "public-resolver"
      ? "Public DNS resolver"
      : "Anycast"
    : item.kind === "anycast"
      ? "Anycast"
      : item.kind.toUpperCase();

const observationLine = (item: Observation, ownerAsn?: number): string => {
  const scope = [
    item.target,
    item.asn && item.asn !== ownerAsn ? `AS${item.asn}` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  const value =
    item.kind === "ptr" && item.value
      ? ` · ${text(item.value)}`
      : isPolicy(item) && item.value
        ? ` · policy ${text(item.value)}`
        : "";
  return `- ${text(observationLabel(item))} ${statusBadge(item.status)} · ${text(scope)}${value}`;
};

const observationList = (
  headingMarkdown: string,
  items: Observation[],
  limit: number,
  ownerAsn?: number,
): string | undefined =>
  items.length
    ? paragraphs([
        headingMarkdown,
        items
          .slice(0, limit)
          .map((item) => observationLine(item, ownerAsn))
          .join("\n"),
        remaining(items.length, limit, ["observation", "observations"]),
      ])
    : undefined;

export const formatDn42IpHover = (info: Dn42IpInfo): string => {
  const data = info.dn42;
  const types = data?.network_types ?? [];
  const location = [
    ...new Set(
      [
        info.city,
        info.regionName ?? info.region,
        info.countryName ?? info.country,
      ].filter((value): value is string => Boolean(value)),
    ),
  ].join(", ");
  const registered = info.registeredCountryName ?? info.registeredCountry;
  const withheld = data?.evidence.some(
    (item) => item.kind === "geofeed-withheld",
  );
  const roles = [
    types.includes("public-resolver") ? "**Public DNS resolver**" : undefined,
    data && data.anycast !== "unknown"
      ? `Anycast ${statusBadge(data.anycast)}`
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  const locationSummary = withheld
    ? "*Location withheld by GeoFeed*"
    : location
      ? `**${data?.confidence === "geofeed" ? "⌖ " : ""}${text(location)}**${data?.confidence === "geofeed" ? " · *GeoFeed location*" : ""}`
      : registered
        ? `Registered in ${text(registered)}`
        : roles
          ? undefined
          : "*Location not recorded*";
  const ptr = data?.observations.find((item) => item.kind === "ptr");
  const ptrValue = data?.ptr.length
    ? `${data.ptr.slice(0, 2).join(", ")}${data.ptr.length > 2 ? ` · ${data.ptr.length - 2} more` : ""}`
    : ptr?.status === "nxdomain"
      ? "NXDOMAIN (observed)"
      : ptr?.status === "unknown"
        ? "Unknown (lookup inconclusive)"
        : undefined;
  const hints = pathHints(types);
  const otherTypes = types.filter(
    (type) =>
      type !== "anycast" && type !== "public-resolver" && !pathLabels.has(type),
  );
  const warnings = data?.observations.filter(isFailedPolicy) ?? [];
  return paragraphs([
    `### ${text(info.ip)}`,
    lines([
      roles || undefined,
      locationSummary,
      info.asn
        ? `AS${info.asn}${info.asName ? ` · ${text(info.asName)}` : ""}`
        : undefined,
      registered &&
      ((location && info.registeredCountry !== info.country) || withheld)
        ? `Registered in ${text(registered)}`
        : undefined,
    ]),
    data
      ? lines([
          "*DN42 registry*",
          data.roa_prefix === data.irr_prefix
            ? `${policyLine("ROA", data.roa_status)} · ${policyLine("IRR", data.irr_status)}`
            : policyLine("ROA", data.roa_status, data.roa_prefix),
          data.roa_prefix === data.irr_prefix
            ? data.roa_prefix
              ? `Policy for both: ${text(data.roa_prefix)}`
              : undefined
            : policyLine("IRR", data.irr_status, data.irr_prefix),
        ])
      : undefined,
    observationList("**Origin observations**", warnings, 2),
    "---",
    lines([
      info.prefix ? `Network ${text(info.prefix)}` : undefined,
      ptrValue ? `PTR: ${text(ptrValue)}` : undefined,
      info.connectionType ? `Access: ${text(info.connectionType)}` : undefined,
      hints.length ? `BGP path: ${hints.join(" · ")}` : undefined,
      otherTypes.length
        ? `Network types: ${otherTypes.map(text).join(" · ")}`
        : undefined,
    ]),
    "*Source: DN42 IPDB*",
  ]);
};

export const formatDn42AsnHover = (info: Dn42AsnInfo): string => {
  const countries = info.registered_countries.map(
    (country) => country.names.en ?? country.iso_code,
  );
  const hints = pathHints(info.observed_network_types);
  const policies = ["roa", "irr"].flatMap((kind) => {
    const matching = info.observations.filter((item) => item.kind === kind);
    const selected = matching.find(isFailedPolicy) ?? matching[0];
    return selected ? [selected] : [];
  });
  const memberObservations = info.observations.filter(
    (item) =>
      item.kind === "ptr" ||
      item.kind === "anycast" ||
      (item.kind === "network_type" &&
        (item.value === "public-resolver" || item.value === "anycast")),
  );
  return paragraphs([
    `### AS${info.asn}`,
    lines([
      info.as_name ? text(info.as_name) : undefined,
      `**${info.prefixes.length} prefixes**`,
    ]),
    policies.length
      ? observationList(
          "**Member policy** · *DN42 registry*",
          policies,
          2,
          info.asn,
        )
      : undefined,
    "---",
    countries.length
      ? `Registered in ${countries.slice(0, 4).map(text).join(", ")}${countries.length > 4 ? ` · ${countries.length - 4} more` : ""}`
      : undefined,
    lines([
      ...info.prefixes.slice(0, 2).map(text),
      remaining(info.prefixes.length, 2, ["prefix", "prefixes"]),
    ]),
    hints.length ? `BGP path on members: ${hints.join(" · ")}` : undefined,
    memberObservations.length
      ? observationList(
          "**Member observations**",
          memberObservations,
          2,
          info.asn,
        )
      : policies.length
        ? undefined
        : "*No member observations recorded*",
    "*Source: DN42 IPDB*",
  ]);
};
