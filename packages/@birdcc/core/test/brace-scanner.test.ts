import { describe, expect, it } from "vitest";
import { scanBraceDepth } from "../src/detection/brace-scanner.js";

describe("scanBraceDepth", () => {
  it("detects global router id at depth 0", () => {
    const content = `router id 10.0.0.1;
protocol device {}
`;
    const result = scanBraceDepth(content);
    expect(result.globalRouterIdLines).toEqual([1]);
    expect(result.protocolRouterIdLines).toEqual([]);
  });

  it("detects protocol-level router id at depth > 0", () => {
    const content = `protocol bgp edge {
  router id 10.0.0.99;
  local as 65001;
}
`;
    const result = scanBraceDepth(content);
    expect(result.globalRouterIdLines).toEqual([]);
    expect(result.protocolRouterIdLines).toEqual([2]);
  });

  it("classifies both global and protocol-level router id", () => {
    const content = `router id 10.0.0.1;
protocol bgp edge {
  router id 10.0.0.99;
}
`;
    const result = scanBraceDepth(content);
    expect(result.globalRouterIdLines).toEqual([1]);
    expect(result.protocolRouterIdLines).toEqual([3]);
  });

  it("ignores router id in line comments", () => {
    const content = `# router id 10.0.0.1;
protocol device {}
`;
    const result = scanBraceDepth(content);
    expect(result.globalRouterIdLines).toEqual([]);
    expect(result.protocolRouterIdLines).toEqual([]);
  });

  it("ignores router id in block comments", () => {
    const content = `/* router id 10.0.0.1; */
protocol device {}
`;
    const result = scanBraceDepth(content);
    expect(result.globalRouterIdLines).toEqual([]);
  });

  it("handles multi-line block comments", () => {
    const content = `/*
router id 10.0.0.1;
*/
router id 10.0.0.2;
`;
    const result = scanBraceDepth(content);
    expect(result.globalRouterIdLines).toEqual([4]);
  });

  it("ignores router id inside string literals", () => {
    const content = `log "router id test" stderr;
router id 10.0.0.1;
`;
    const result = scanBraceDepth(content);
    // The real router id is on line 2
    expect(result.globalRouterIdLines).toContain(2);
  });

  it("handles nested braces correctly", () => {
    const content = `protocol ospf v2 {
  area 0 {
    interface "eth0" {
      router id 10.0.0.1;
    };
  };
}
`;
    const result = scanBraceDepth(content);
    expect(result.globalRouterIdLines).toEqual([]);
    expect(result.protocolRouterIdLines).toEqual([4]);
  });
});
