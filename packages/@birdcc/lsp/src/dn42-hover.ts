import type { Dn42AsnInfo, Dn42IpInfo } from "@birdcc/intel";
import { encodeHTML } from "entities";

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
const status = (value: string): string => text(statuses.get(value) ?? value);
const pathHints = new Map([
  ["bgp-path-tunnel", "Tunnel"],
  ["bgp-path-ixp", "IXP"],
  ["bgp-path-centralized-vix", "Centralized VIX"],
]);

export const formatDn42IpHover = (info: Dn42IpInfo): string => {
  const data = info.dn42;
  const types = data?.network_types ?? [];
  const locationWithheld =
    data?.evidence.some((item) => item.kind === "geofeed-withheld") === true;
  const location = [
    info.city,
    info.regionName ?? info.region,
    info.countryName ?? info.country,
  ]
    .filter((value): value is string => Boolean(value))
    .map(text)
    .join(", ");
  const registered = info.registeredCountryName ?? info.registeredCountry;
  const services = [
    types.includes("public-resolver") ? "`Public DNS resolver`" : undefined,
    data?.anycast === "published"
      ? "`Anycast · published`"
      : data && data.anycast !== "unknown"
        ? `Anycast (${text(data.anycast)})`
        : undefined,
  ].filter(Boolean);
  const hints = types.flatMap((type) => {
    const label = pathHints.get(type);
    return label ? [label] : [];
  });
  const otherTypes = types.filter(
    (type) =>
      type !== "anycast" && type !== "public-resolver" && !pathHints.has(type),
  );
  const ptr = data?.observations.find((item) => item.kind === "ptr");
  const ptrText = data?.ptr.length
    ? `${data.ptr.slice(0, 2).map(text).join(", ")}${data.ptr.length > 2 ? ` · ${data.ptr.length - 2} more` : ""}`
    : ptr?.status === "nxdomain"
      ? "NXDOMAIN (observed)"
      : ptr?.status === "unknown"
        ? "Unknown (lookup inconclusive)"
        : undefined;
  const details = [
    info.prefix ? `**Matched network** ${text(info.prefix)}` : undefined,
    registered &&
    ((location && info.registeredCountry !== info.country) ||
      (!location && locationWithheld))
      ? `**Registered in** ${text(registered)}`
      : undefined,
    info.connectionType ? `**Access** ${text(info.connectionType)}` : undefined,
    ptrText ? `**PTR** ${ptrText}` : undefined,
    hints.length ? `**BGP path hints** ${hints.join(" · ")}` : undefined,
    otherTypes.length
      ? `**Network types** ${otherTypes.map(text).join(" · ")}`
      : undefined,
  ].filter(Boolean);
  const policy = data
    ? data.roa_status === "unknown" &&
      data.irr_status === "unknown" &&
      !data.roa_prefix &&
      !data.irr_prefix
      ? "**ROA** Unknown · **IRR** Unknown"
      : [
          `**ROA** ${status(data.roa_status)}${data.roa_prefix ? ` · ${text(data.roa_prefix)}` : ""}`,
          `**IRR** ${status(data.irr_status)}${data.irr_prefix ? ` · ${text(data.irr_prefix)}` : ""}`,
        ].join("  \n")
    : undefined;
  const originWarnings = data?.observations
    .filter(
      (item) =>
        (item.kind === "roa" || item.kind === "irr") &&
        (item.status === "conflict" || item.status === "invalid"),
    )
    .slice(0, 2)
    .map(
      (item) =>
        `${item.asn ? `AS${item.asn} · ` : ""}${item.kind.toUpperCase()} ${status(item.status)} · ${text(item.target)}`,
    );
  return [
    `**${text(info.ip)}** · DN42 IPDB`,
    [
      info.asn
        ? `**AS${info.asn}**${info.asName ? ` · ${text(info.asName)}` : ""}`
        : undefined,
      (location
        ? `${location}${data?.confidence === "geofeed" ? " · *GeoFeed location*" : ""}`
        : undefined) ||
        (locationWithheld
          ? "*Location withheld by GeoFeed*"
          : registered
            ? `**Registered in** ${text(registered)}`
            : "*Location not recorded*"),
      services.length ? services.join(" · ") : undefined,
    ]
      .filter(Boolean)
      .join("  \n"),
    policy ? `**DN42 registry policy**  \n${policy}` : undefined,
    details.length ? details.join("  \n") : undefined,
    originWarnings?.length
      ? `**Origin policy observations**  \n${originWarnings.join("  \n")}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");
};

export const formatDn42AsnHover = (info: Dn42AsnInfo): string => {
  const countries = info.registered_countries
    .slice(0, 4)
    .map((country) => text(country.names.en ?? country.iso_code));
  const hints = info.observed_network_types.flatMap((type) => {
    const label = pathHints.get(type);
    return label ? [label] : [];
  });
  const validation = ["roa", "irr"].flatMap((kind) => {
    const matching = info.observations.filter((item) => item.kind === kind);
    const item =
      matching.find(
        (item) => item.status === "invalid" || item.status === "conflict",
      ) ?? matching[0];
    return item ? [item] : [];
  });
  const observations = [
    ...validation,
    ...info.observations
      .filter(
        (item) =>
          item.kind === "ptr" ||
          item.kind === "anycast" ||
          item.kind === "network_type",
      )
      .filter(
        (item) =>
          item.kind !== "network_type" ||
          item.value === "public-resolver" ||
          item.value === "anycast",
      )
      .slice(0, 2),
  ];
  return [
    `**AS${info.asn}** · DN42 IPDB${info.as_name ? `  \n${text(info.as_name)}` : ""}`,
    [
      countries.length
        ? `**Registered in** ${countries.join(", ")}${info.registered_countries.length > 4 ? ` · ${info.registered_countries.length - 4} more` : ""}`
        : undefined,
      `**${info.prefixes.length} prefixes**`,
    ]
      .filter(Boolean)
      .join("  \n"),
    [
      ...info.prefixes.slice(0, 2).map((prefix) => text(prefix)),
      info.prefixes.length > 2
        ? `*${info.prefixes.length - 2} more prefixes*`
        : undefined,
    ]
      .filter(Boolean)
      .join("  \n"),
    hints.length
      ? `**BGP path hints on members** ${hints.join(" · ")}`
      : undefined,
    observations.length
      ? `**Member observations**  \n${observations
          .map((item) => {
            const label =
              item.kind === "network_type"
                ? item.value === "public-resolver"
                  ? "Public DNS resolver"
                  : "Anycast"
                : item.kind === "anycast"
                  ? "Anycast"
                  : item.kind.toUpperCase();
            return `${text(item.target)} · **${label}** ${status(item.status)}${item.asn && item.asn !== info.asn ? ` · AS${item.asn}` : ""}${item.kind === "ptr" && item.value ? ` · ${text(item.value)}` : ""}${(item.kind === "roa" || item.kind === "irr") && item.value ? ` · policy ${text(item.value)}` : ""}`;
          })
          .join("  \n")}`
      : "*No member observations recorded*",
    validation.length
      ? "*Policy observations use DN42 registry objects.*"
      : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");
};
