// Run: node bench-ip.mjs

import { bench, run, summary, barplot } from "mitata";
import { isIP } from "node:net";

// --- regex implementations ---
// Validates each octet: 0-255, no leading zeros
const IPv4_RE =
  /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)){3}$/;

// Covers all RFC 4291 compressed forms (::, ::1, 1::, fe80::1, etc.)
// Zone ID (fe80::1%eth0) intentionally excluded — match node:net behavior = include it
const IPv6_RE =
  /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]+|::(ffff(:0{1,4})?:)?((25[0-5]|(2[0-4]|1?\d)?\d)\.){3}(25[0-5]|(2[0-4]|1?\d)?\d)|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1?\d)?\d)\.){3}(25[0-5]|(2[0-4]|1?\d)?\d))$/;

/** Returns 4 | 6 | 0 — same contract as node:net isIP */
const isIP_regex = (input) => {
  if (IPv4_RE.test(input)) return 4;
  if (IPv6_RE.test(input)) return 6;
  return 0;
};

// --- test fixtures: mix of ipv4 / ipv6 / invalid ---
const samples = [
  "127.0.0.1", // valid ipv4
  "192.168.1.255", // valid ipv4
  "0.0.0.0", // valid ipv4
  "255.255.255.255", // valid ipv4
  "::1", // valid ipv6 loopback
  "2001:db8::1", // valid ipv6
  "fe80::1%eth0", // ipv6 with zone id  (isIP → 0, regex → 0)
  "not-an-ip", // invalid
  "127.000.000.001", // invalid (leading zeros)
  "999.999.999.999", // invalid (out of range)
];

const sample100k = Array.from(
  { length: 100000 },
  () => samples[Math.floor(Math.random() * samples.length)],
);

// Sanity-check: both implementations must agree on every sample
for (const s of samples) {
  const r = isIP_regex(s);
  const n = isIP(s);
  if (r !== n) console.warn(`[mismatch] "${s}"  regex=${r}  node=${n}`);
}

// --- benchmarks ---
summary(() => {
  barplot(() => {
    bench("regex  · single sample (127.0.0.1)", () => isIP_regex("127.0.0.1"));
    bench("node   · single sample (127.0.0.1)", () => isIP("127.0.0.1"));

    bench("regex  · single sample (::1)", () => isIP_regex("::1"));
    bench("node   · single sample (::1)", () => isIP("::1"));

    bench("regex  · single sample (invalid)", () => isIP_regex("not-an-ip"));
    bench("node   · single sample (invalid)", () => isIP("not-an-ip"));

    bench("regex  · 10-sample mixed loop", () => {
      for (const s of samples) isIP_regex(s);
    });
    bench("node   · 10-sample mixed loop", () => {
      for (const s of samples) isIP(s);
    });
    bench("regex  · 100k-sample random loop", () => {
      for (const s of sample100k) isIP_regex(s);
    });
    bench("node   · 100k-sample random loop", () => {
      for (const s of sample100k) isIP(s);
    });
  });
});

await run();
