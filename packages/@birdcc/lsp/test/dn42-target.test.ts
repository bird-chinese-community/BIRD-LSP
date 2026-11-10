import { beforeEach, expect, it, vi } from "vitest";
import { findNetworkLiteralAt } from "@birdcc/parser";
import { findDn42HoverTarget } from "../src/dn42-target.js";

vi.mock("@birdcc/parser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@birdcc/parser")>();
  return {
    ...actual,
    findNetworkLiteralAt: vi.fn(actual.findNetworkLiteralAt),
  };
});

const source = [
  "protocol bgp edge { neighbor 172.20.0.1 as 4242420001; }",
  "# neighbor 172.20.0.1 as 4242420001;",
  "/* local as 4242420001;",
  "neighbor fd00::1 as 4242420001; */",
  "protocol static routes { ipv4; route 172.20.0.0/24 blackhole; }",
].join("\n");
const lines = source.split("\n");
const target = (line: number, character: number) =>
  findDn42HoverTarget(source, lines[line] ?? "", { line, character });

beforeEach(() => {
  vi.mocked(findNetworkLiteralAt).mockClear();
});

it("resolves IP literals and ASN integers in code", async () => {
  expect(await target(0, 31)).toMatchObject({
    kind: "ip",
    ip: "172.20.0.1",
    range: { line: 1, column: 30 },
  });
  expect(await target(0, 45)).toMatchObject({
    kind: "asn",
    asn: 4242420001,
    range: { line: 1, column: 44 },
  });
});

it("rejects comments and prefix literals", async () => {
  expect(await target(4, 40)).toBeNull();
  expect(await target(1, 13)).toBeNull();
  expect(await target(1, 28)).toBeNull();
  expect(await target(2, 14)).toBeNull();
  expect(await target(3, 11)).toBeNull();
});

it("skips parsing for tokens that cannot be DN42 targets", async () => {
  for (const [line, character] of [
    [0, 3],
    [0, 20],
    [0, 39],
    [0, 41],
    [4, 47],
    [4, 52],
  ] as const)
    expect(await target(line, character)).toBeNull();
  expect(findNetworkLiteralAt).not.toHaveBeenCalled();
});
