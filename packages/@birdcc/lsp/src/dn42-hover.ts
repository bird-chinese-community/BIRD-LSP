import type { Dn42AsnInfo, Dn42IpInfo } from "@birdcc/intel";
import { encodeHTML } from "entities";

export const toDn42HoverMarkdown = (text: string): string =>
  text
    .split("\n")
    .map((line) => encodeHTML(line))
    .join("  \n");

export const formatDn42IpHover = (info: Dn42IpInfo): string => {
  const data = info.dn42;
  const ptrStatus = data?.observations.find(
    (observation) =>
      observation.kind === "ptr" && observation.status === "nxdomain",
  );
  return [
    "DN42 IPDB",
    `IP: ${info.ip}${info.prefix ? ` · Prefix: ${info.prefix}` : ""}`,
    info.asn
      ? `AS${info.asn}${info.asName ? ` ${info.asName}` : ""}`
      : undefined,
    [
      info.city,
      info.regionName ?? info.region,
      info.countryName ?? info.country,
    ]
      .filter(Boolean)
      .join(", "),
    data
      ? `Anycast: ${data.anycast}${data.network_types.length ? ` · Types: ${data.network_types.join(", ")}` : ""}`
      : undefined,
    info.connectionType ? `Connection: ${info.connectionType}` : undefined,
    data?.ptr.length
      ? `PTR: ${data.ptr.join(", ")}`
      : ptrStatus
        ? "PTR: NXDOMAIN (observed)"
        : undefined,
    data
      ? `ROA policy (DN42 registry): ${data.roa_status}${data.roa_prefix ? ` · ${data.roa_prefix}` : ""}`
      : undefined,
    data
      ? `IRR (DN42 registry route object): ${data.irr_status}${data.irr_prefix ? ` · ${data.irr_prefix}` : ""}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");
};

export const formatDn42AsnHover = (info: Dn42AsnInfo): string => {
  const observations = info.observations.filter(
    (item) =>
      item.kind === "anycast" ||
      item.kind === "network_type" ||
      item.kind === "ptr",
  );
  const validation = ["roa", "irr"].flatMap((kind) => {
    const observation = info.observations.find((item) => item.kind === kind);
    return observation ? [observation] : [];
  });
  return [
    "DN42 IPDB",
    `AS${info.asn}${info.as_name ? ` ${info.as_name}` : ""}`,
    info.registered_countries.length
      ? `Registered countries: ${info.registered_countries.map((country) => country.names.en ?? country.iso_code).join(", ")}`
      : undefined,
    `Prefixes: ${info.prefixes.length} · ${info.prefixes.slice(0, 2).join(", ")}${info.prefixes.length > 2 ? ` … ${info.prefixes.length - 2} more` : ""}`,
    info.observed_network_types.length
      ? `Types observed on member prefixes: ${info.observed_network_types.join(", ")}`
      : undefined,
    ...observations
      .slice(0, 1)
      .map(
        (item) =>
          `${item.target}: ${item.kind}${item.value ? ` ${item.value}` : ""} (${item.status})`,
      ),
    ...validation.map(
      (item) =>
        `${item.target}: ${item.kind === "roa" ? "ROA policy (DN42 registry)" : "IRR route object"} ${item.status}${item.value ? ` (authority ${item.value})` : ""}`,
    ),
  ]
    .filter(Boolean)
    .join("\n");
};
