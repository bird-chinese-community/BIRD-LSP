import { describe, expect, it } from "vitest";
import type { ParsedBirdDocument } from "@birdcc/parser";
import {
  collectBirdDeclarationEvidence,
  evaluateBirdDocumentEligibility,
  isCanonicalBirdConfigPath,
} from "../src/detection/index.js";

describe("BIRD document eligibility", () => {
  it.each([
    ["empty", ""],
    ["comment", "# protocol device {}"],
    ["string", 'message = "protocol device {}";'],
    ["nginx", "events {}\nhttp { server { listen 80; } }"],
    ["apache", "<VirtualHost *:80>\n  ServerName example.test\n</VirtualHost>"],
    ["haproxy", "global\n  daemon\ndefaults\n  mode http"],
    ["redis", "maxmemory 2gb\nsave 60 1"],
    ["prometheus", "global:\n  scrape_interval: 15s"],
    ["systemd", "[Service]\nExecStart=/usr/bin/example"],
    [
      "foreign protocol DSL",
      'protocol http { endpoint = "https://example.test"; }',
    ],
  ])("rejects %s content without BIRD evidence", async (_name, content) => {
    const result = await evaluateBirdDocumentEligibility(content, {
      filePath: "custom.conf",
    });

    expect(result).toEqual({
      eligible: false,
      reason: "no-evidence",
      declarationKinds: [],
    });
  });

  it.each([
    ["router id 192.0.2.1;", "router-id"],
    ['include "parts/*.conf";', "include"],
    ["define LOCAL_AS = 65001;", "define"],
    ["ipv4 table master4;", "table"],
    ["filter IMPORT { accept; }", "filter"],
    ["function metric() { return 100; }", "function"],
    ["template bgp EDGE {}", "template"],
    ["protocol device {}", "protocol"],
    ['timeformat log "%F %T";', "timeformat"],
  ])("accepts parsed %s declarations", async (content, declarationKind) => {
    const result = await evaluateBirdDocumentEligibility(content, {
      filePath: "custom.conf",
    });

    expect(result.eligible).toBe(true);
    expect(result.reason).toBe("semantic-evidence");
    expect(result.declarationKinds).toContain(declarationKind);
  });

  it("keeps canonical and explicit-main escape hatches", async () => {
    expect(isCanonicalBirdConfigPath("/etc/bird/bird3.conf")).toBe(true);
    expect(isCanonicalBirdConfigPath("/tmp/.bird2.conf")).toBe(true);

    await expect(
      evaluateBirdDocumentEligibility("", { filePath: "bird6.conf" }),
    ).resolves.toMatchObject({
      eligible: true,
      reason: "canonical-filename",
    });
    await expect(
      evaluateBirdDocumentEligibility("", {
        filePath: "custom.conf",
        explicitMain: true,
      }),
    ).resolves.toMatchObject({
      eligible: true,
      reason: "explicit-main",
    });
  });

  it("ignores malformed protocol declarations without a protocol type", () => {
    const parsed = {
      program: {
        declarations: [{ kind: "protocol", statements: [] }],
      },
    } as unknown as ParsedBirdDocument;

    expect(collectBirdDeclarationEvidence(parsed)).toEqual([]);
  });
});
