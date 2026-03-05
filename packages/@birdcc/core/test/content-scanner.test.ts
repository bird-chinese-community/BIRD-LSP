import { describe, expect, it } from "vitest";
import { extractContentSignals } from "../src/detection/content-scanner.js";

describe("extractContentSignals", () => {
  it("detects global router id and protocol blocks", () => {
    const content = `
router id 10.0.0.1;
protocol device {}
protocol kernel { ipv4 { export all; }; }
`;
    const signals = extractContentSignals(content);
    expect(signals.hasGlobalRouterId).toBe(true);
    expect(signals.hasProtocolBlock).toBe(true);
    expect(signals.hasProtocolDevice).toBe(true);
    expect(signals.hasProtocolKernel).toBe(true);
  });

  it("detects include statements", () => {
    const content = `
include "peers.conf";
include "filters/main.conf";
`;
    const signals = extractContentSignals(content);
    expect(signals.includeStatements).toEqual([
      "peers.conf",
      "filters/main.conf",
    ]);
  });

  it("detects commented includes separately", () => {
    const content = `
# include "old-peers.conf";
include "peers.conf";
`;
    const signals = extractContentSignals(content);
    expect(signals.commentedIncludes).toEqual(["old-peers.conf"]);
    expect(signals.includeStatements).toEqual(["peers.conf"]);
  });

  it("detects log directives", () => {
    const content = `
log syslog all;
router id 10.0.0.1;
`;
    const signals = extractContentSignals(content);
    expect(signals.hasLogDirective).toBe(true);
  });

  it("detects define-only files", () => {
    const content = `
define LOCAL_AS = 65001;
define ROUTER_NAME = "router1";
`;
    const signals = extractContentSignals(content);
    expect(signals.hasDefine).toBe(true);
    expect(signals.hasProtocolBlock).toBe(false);
  });

  it("handles protocol-only router id", () => {
    const content = `
protocol bgp edge {
  router id 10.0.0.99;
  local as 65001;
}
`;
    const signals = extractContentSignals(content);
    expect(signals.hasGlobalRouterId).toBe(false);
    expect(signals.hasProtocolRouterIdOnly).toBe(true);
  });
});
