import {
  escapeMarkdown,
  type Dn42AsnInfo,
  type Dn42IpInfo,
} from "@birdcc/intel";

/** `html` targets clients that allow `span` and `table`; `markdown` is portable. */
export type Dn42HoverMarkup = "html" | "markdown";

type Observation = NonNullable<Dn42IpInfo["dn42"]>["observations"][number];

type Part =
  | { kind: "text" | "muted" | "id" | "badge"; value: string }
  | { kind: "status"; value: string }
  | { kind: "icon"; name: string };

type Line = Part[];

interface Row {
  label: string;
  lines: Line[];
}

interface Card {
  icon: string;
  title: string;
  summary: Line[];
  rows: Row[];
}

interface StatusStyle {
  label: string;
  icon: string;
  color: string;
  marker: string;
}

const MUTED = "descriptionForeground";
const ATTRIBUTION = "DN42 IPDB · registry data";

const statuses = new Map<string, StatusStyle>([
  [
    "valid",
    {
      label: "Valid",
      icon: "pass-filled",
      color: "testing-iconPassed",
      marker: "✓",
    },
  ],
  [
    "exact",
    {
      label: "Exact",
      icon: "pass-filled",
      color: "testing-iconPassed",
      marker: "✓",
    },
  ],
  [
    "covering",
    {
      label: "Covering",
      icon: "pass",
      color: "editorInfo-foreground",
      marker: "↳",
    },
  ],
  [
    "invalid",
    { label: "Invalid", icon: "error", color: "errorForeground", marker: "✗" },
  ],
  [
    "conflict",
    {
      label: "Conflict",
      icon: "warning",
      color: "editorWarning-foreground",
      marker: "!",
    },
  ],
  [
    "unknown",
    { label: "Unknown", icon: "question", color: MUTED, marker: "?" },
  ],
  [
    "nxdomain",
    { label: "NXDOMAIN", icon: "circle-slash", color: MUTED, marker: "⊘" },
  ],
]);
const evidenceLabels = new Map([
  ["observed", "observed"],
  ["advertised", "advertised"],
  ["published", "published"],
]);
const pathLabels = new Map([
  ["bgp-path-tunnel", "Tunnel"],
  ["bgp-path-ixp", "IXP"],
  ["bgp-path-centralized-vix", "Centralized VIX"],
]);

const text = (value: string): Part => ({ kind: "text", value });
const muted = (value: string): Part => ({ kind: "muted", value });
const id = (value: string): Part => ({ kind: "id", value });
const badge = (value: string): Part => ({ kind: "badge", value });
const status = (value: string): Part => ({ kind: "status", value });
const icon = (name: string): Part => ({ kind: "icon", name });

const clean = (value: string): string => value.replace(/\s+/g, " ").trim();
const more = (total: number, shown: number): Line[] =>
  total > shown ? [[muted(`${total - shown} more`)]] : [];
const row = (label: string, lines: Line[]): Row[] =>
  lines.length ? [{ label, lines }] : [];

// HTML form: only spans with sanitizer-approved styles and codicon classes.
const escapeHtml = (value: string): string =>
  clean(value).replace(
    /[&<>"']/g,
    (character) => `&#${character.charCodeAt(0)};`,
  );
const tinted = (color: string, inner: string): string =>
  `<span style="color:var(--vscode-${color});">${inner}</span>`;
const codicon = (name: string): string =>
  `<span class="codicon codicon-${name}"></span>`;

const htmlPart = (part: Part): string => {
  switch (part.kind) {
    case "text":
    case "id":
      return escapeHtml(part.value);
    case "muted":
      return tinted(MUTED, escapeHtml(part.value));
    case "badge":
      return `<span style="color:var(--vscode-badge-foreground);background-color:var(--vscode-badge-background);border-radius:4px;">&nbsp;${escapeHtml(part.value)}&nbsp;</span>`;
    case "icon":
      return codicon(part.name);
    case "status": {
      const style = statuses.get(part.value);
      return style
        ? `${tinted(style.color, codicon(style.icon))}&nbsp;${style.label}`
        : escapeHtml(part.value);
    }
  }
};

const htmlLine = (line: Line): string => line.map(htmlPart).join(" ");

const renderHtml = (card: Card): string =>
  [
    `<h3>${codicon(card.icon)} ${escapeHtml(card.title)}</h3>`,
    card.summary.length
      ? `<p>${card.summary.map(htmlLine).join("<br>")}</p>`
      : undefined,
    card.rows.length
      ? `<table>${card.rows
          .flatMap(({ label, lines }) =>
            lines.map(
              (line, index) =>
                `<tr><td>${index ? "" : `${tinted(MUTED, escapeHtml(label))}&emsp;`}</td><td>${htmlLine(line)}</td></tr>`,
            ),
          )
          .join("")}</table>`
      : undefined,
    "<hr>",
    `<p>${tinted(MUTED, escapeHtml(ATTRIBUTION))}</p>`,
  ]
    .filter(Boolean)
    .join("\n");

// Markdown form: code spans for identifiers, backslash escapes for prose.
const codeSpan = (value: string): string => {
  const content = clean(value);
  const longest = Math.max(
    0,
    ...(content.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = "`".repeat(longest + 1);
  const padded = /^`|`$/.test(content) ? ` ${content} ` : content;
  return `${fence}${padded}${fence}`;
};

const markdownPart = (part: Part): string | undefined => {
  switch (part.kind) {
    case "text":
    case "badge":
      return escapeMarkdown(part.value);
    case "id":
      return codeSpan(part.value);
    case "muted":
      return `*${escapeMarkdown(part.value)}*`;
    case "icon":
      return part.name === "location" ? "⌖" : undefined;
    case "status": {
      const style = statuses.get(part.value);
      return style
        ? `${style.marker} ${style.label}`
        : escapeMarkdown(part.value);
    }
  }
};

const markdownLine = (line: Line): string =>
  line
    .map(markdownPart)
    .filter((part): part is string => Boolean(part))
    .join(" ");

const renderMarkdown = (card: Card): string =>
  [
    `### ${codeSpan(card.title)}`,
    card.summary.length
      ? card.summary.map(markdownLine).join("  \n")
      : undefined,
    card.rows.length
      ? card.rows
          .flatMap(({ label, lines }) =>
            lines.map((line, index) =>
              index
                ? markdownLine(line)
                : `**${escapeMarkdown(label)}** ${markdownLine(line)}`,
            ),
          )
          .join("  \n")
      : undefined,
    "---",
    `*${escapeMarkdown(ATTRIBUTION)}*`,
  ]
    .filter(Boolean)
    .join("\n\n");

const render = (card: Card, markup: Dn42HoverMarkup): string =>
  markup === "html" ? renderHtml(card) : renderMarkdown(card);

const pathHints = (types: readonly string[]): string[] => [
  ...new Set(
    types.flatMap((type) => {
      const label = pathLabels.get(type);
      return label ? [label] : [];
    }),
  ),
];
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
const evidence = (value: string): Part =>
  evidenceLabels.has(value) ? muted(value) : status(value);
const foreignAsn = (item: Observation, ownerAsn?: number): Part[] =>
  item.asn && item.asn !== ownerAsn ? [muted(`AS${item.asn}`)] : [];

const policyObservation = (item: Observation, ownerAsn?: number): Line => [
  status(item.status),
  id(item.target),
  ...foreignAsn(item, ownerAsn),
  ...(item.value ? [muted("policy"), id(item.value)] : []),
];

const serviceObservation = (item: Observation, ownerAsn?: number): Line => [
  text(observationLabel(item)),
  evidence(item.status),
  id(item.target),
  ...foreignAsn(item, ownerAsn),
  ...(item.kind === "ptr" && item.value ? [id(item.value)] : []),
];

const limited = <T>(
  items: readonly T[],
  toLine: (item: T) => Line,
  limit = 2,
): Line[] => [
  ...items.slice(0, limit).map(toLine),
  ...more(items.length, limit),
];

/** Renders a DN42 address lookup as a title, owner summary and property sheet. */
export const formatDn42IpHover = (
  info: Dn42IpInfo,
  markup: Dn42HoverMarkup = "markdown",
): string => {
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
    ...(types.includes("public-resolver")
      ? [badge("Public DNS resolver")]
      : []),
    ...(data && data.anycast !== "unknown"
      ? [badge("Anycast"), evidence(data.anycast)]
      : []),
  ];
  const ptr = data?.observations.find((item) => item.kind === "ptr");
  const ptrLines: Line[] = data?.ptr.length
    ? limited(data.ptr, (name) => [id(name)])
    : ptr?.status === "nxdomain"
      ? [[status("nxdomain"), muted("observed")]]
      : ptr?.status === "unknown"
        ? [[status("unknown"), muted("lookup inconclusive")]]
        : [];
  const hints = pathHints(types);
  const otherTypes = types.filter(
    (type) =>
      type !== "anycast" && type !== "public-resolver" && !pathLabels.has(type),
  );
  const conflicts = data?.observations.filter(isFailedPolicy) ?? [];
  const policy = (result: string, prefix?: string): Line[] => [
    [status(result), ...(prefix ? [muted(prefix)] : [])],
  ];

  return render(
    {
      icon: "globe",
      title: info.ip,
      summary: [
        ...(info.asn
          ? [
              info.asName
                ? [text(info.asName), muted(`AS${info.asn}`)]
                : [text(`AS${info.asn}`)],
            ]
          : []),
        ...(roles.length ? [roles] : []),
      ],
      rows: [
        ...row(
          "Location",
          withheld
            ? [[icon("eye-closed"), muted("Withheld by GeoFeed")]]
            : location
              ? [
                  [
                    icon("location"),
                    text(location),
                    ...(data?.confidence === "geofeed"
                      ? [muted("GeoFeed")]
                      : []),
                  ],
                ]
              : registered || roles.length
                ? []
                : [[muted("Not recorded")]],
        ),
        ...row(
          "Registered",
          registered &&
            (withheld || !location || info.registeredCountry !== info.country)
            ? [[text(registered)]]
            : [],
        ),
        ...row("Network", info.prefix ? [[id(info.prefix)]] : []),
        ...(data
          ? [
              ...row("ROA", policy(data.roa_status, data.roa_prefix)),
              ...row("IRR", policy(data.irr_status, data.irr_prefix)),
            ]
          : []),
        ...row(
          "Origins",
          limited(conflicts, (item) => [
            text(item.kind.toUpperCase()),
            ...policyObservation(item, info.asn),
          ]),
        ),
        ...row("PTR", ptrLines),
        ...row(
          "Access",
          info.connectionType ? [[text(info.connectionType)]] : [],
        ),
        ...row("BGP path", hints.length ? [[text(hints.join(", "))]] : []),
        ...row(
          "Types",
          otherTypes.length ? [[text(otherTypes.join(", "))]] : [],
        ),
      ],
    },
    markup,
  );
};

/** Renders a DN42 autonomous system lookup with member policy and services. */
export const formatDn42AsnHover = (
  info: Dn42AsnInfo,
  markup: Dn42HoverMarkup = "markdown",
): string => {
  const countries = info.registered_countries.map(
    (country) => country.names.en ?? country.iso_code,
  );
  const hints = pathHints(info.observed_network_types);
  const policies = ["roa", "irr"].flatMap((kind) => {
    const matching = info.observations.filter((item) => item.kind === kind);
    const selected = matching.find(isFailedPolicy) ?? matching[0];
    return selected ? [selected] : [];
  });
  const services = info.observations.filter(
    (item) =>
      item.kind === "ptr" ||
      item.kind === "anycast" ||
      (item.kind === "network_type" &&
        (item.value === "public-resolver" || item.value === "anycast")),
  );

  return render(
    {
      icon: "organization",
      title: `AS${info.asn}`,
      summary: info.as_name ? [[text(info.as_name)]] : [],
      rows: [
        ...row(
          "Registered",
          countries.length
            ? [
                [
                  text(countries.slice(0, 4).join(", ")),
                  ...(countries.length > 4
                    ? [muted(`${countries.length - 4} more`)]
                    : []),
                ],
              ]
            : [],
        ),
        ...policies.flatMap((item) =>
          row(item.kind.toUpperCase(), [policyObservation(item, info.asn)]),
        ),
        ...row(
          "Services",
          services.length
            ? limited(services, (item) => serviceObservation(item, info.asn))
            : policies.length
              ? []
              : [[muted("No member observations")]],
        ),
        ...row(
          "Prefixes",
          limited(info.prefixes, (prefix) => [id(prefix)]),
        ),
        ...row("BGP path", hints.length ? [[text(hints.join(", "))]] : []),
      ],
    },
    markup,
  );
};
