import type { Dn42AsnInfo, Dn42IpInfo } from "@birdcc/intel";
import { encodeHTML } from "entities";

type Observation = NonNullable<Dn42IpInfo["dn42"]>["observations"][number];
type Row = readonly [label: string, value: string];

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
const status = (value: string): string => statuses.get(value) ?? value;
const pathLabels = new Map([
  ["bgp-path-tunnel", "Tunnel"],
  ["bgp-path-ixp", "IXP"],
  ["bgp-path-centralized-vix", "Centralized VIX"],
]);

const paragraphs = (blocks: (string | undefined)[]): string =>
  blocks.filter(Boolean).join("\n\n");
const lines = (values: (string | undefined)[]): string =>
  values.filter(Boolean).join("  \n");
const table = (heading: Row, rows: Row[]): string =>
  [heading, [":---", ":---"], ...rows]
    .map(
      (row, index) =>
        `| ${row.map((cell) => (index === 1 ? cell : text(cell))).join(" | ")} |`,
    )
    .join("\n");
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
  return `- **${text(observationLabel(item))} ${text(status(item.status))}** · ${text(scope)}${value}`;
};

const observationList = (
  heading: string,
  items: Observation[],
  limit: number,
  ownerAsn?: number,
): string | undefined =>
  items.length
    ? paragraphs([
        `**${heading}**`,
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
    types.includes("public-resolver") ? "Public DNS resolver" : undefined,
    data && data.anycast !== "unknown"
      ? `Anycast (${status(data.anycast)})`
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  const locationSummary = location
    ? `**${text(location)}**${data?.confidence === "geofeed" ? " · *GeoFeed location*" : ""}`
    : withheld
      ? "*Location withheld by GeoFeed*"
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
      info.asn
        ? `AS${info.asn}${info.asName ? ` · ${text(info.asName)}` : ""}`
        : undefined,
      locationSummary,
      registered &&
      ((location && info.registeredCountry !== info.country) || withheld)
        ? `Registered in ${text(registered)}`
        : undefined,
      roles ? `*${text(roles)}*` : undefined,
    ]),
    `*DN42 IPDB*${info.prefix ? ` · Network ${text(info.prefix)}` : ""}`,
    data
      ? table(
          ["DN42 registry", "Result"],
          [
            [
              "ROA",
              `${status(data.roa_status)}${data.roa_prefix ? ` · ${data.roa_prefix}` : ""}`,
            ],
            [
              "IRR",
              `${status(data.irr_status)}${data.irr_prefix ? ` · ${data.irr_prefix}` : ""}`,
            ],
          ],
        )
      : undefined,
    lines([
      ptrValue ? `PTR: ${text(ptrValue)}` : undefined,
      info.connectionType ? `Access: ${text(info.connectionType)}` : undefined,
      hints.length ? `BGP path: ${hints.join(" · ")}` : undefined,
      otherTypes.length
        ? `Network types: ${otherTypes.map(text).join(" · ")}`
        : undefined,
    ]),
    observationList("Origin observations", warnings, 2),
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
      info.as_name ? `**${text(info.as_name)}**` : undefined,
      countries.length
        ? `Registered in ${countries.slice(0, 4).map(text).join(", ")}${countries.length > 4 ? ` · ${countries.length - 4} more` : ""}`
        : undefined,
      `*DN42 IPDB* · **${info.prefixes.length} prefixes**`,
    ]),
    policies.length
      ? table(
          ["DN42 registry", "Member observation"],
          policies.map((item) => [
            observationLabel(item),
            `${status(item.status)} · ${item.target}${item.asn && item.asn !== info.asn ? ` · AS${item.asn}` : ""}${item.value ? ` · policy ${item.value}` : ""}`,
          ]),
        )
      : undefined,
    lines([
      ...info.prefixes.slice(0, 2).map(text),
      remaining(info.prefixes.length, 2, ["prefix", "prefixes"]),
    ]),
    hints.length ? `BGP path on members: ${hints.join(" · ")}` : undefined,
    memberObservations.length
      ? observationList("Member observations", memberObservations, 2, info.asn)
      : policies.length
        ? undefined
        : "*No member observations recorded*",
    policies.length
      ? "*Policy samples apply to the listed member networks.*"
      : undefined,
  ]);
};
