import { beforeEach, expect, it, vi } from "vitest";
import { findNetworkLiteralAt } from "@birdcc/parser";
import { findDn42Hover, type Dn42HoverCandidate } from "../src/dn42-target.js";

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
  'define LABEL = "🌏"; protocol bgp wide { neighbor 172.20.0.2 as 1; }',
].join("\n");
const lines = source.split("\n");
const target = (
  line: number,
  character: number,
  resolve: (candidate: Dn42HoverCandidate) => unknown = (candidate) =>
    candidate,
) => findDn42Hover(source, lines[line] ?? "", { line, character }, resolve);

beforeEach(() => {
  vi.mocked(findNetworkLiteralAt).mockClear();
});

it("resolves IP literals and ASN integers in code", async () => {
  expect(await target(0, 31)).toMatchObject({
    value: { kind: "ip", ip: "172.20.0.1" },
    range: { line: 1, column: 30 },
  });
  expect(await target(0, 45)).toMatchObject({
    value: { kind: "asn", asn: 4242420001 },
    range: { line: 1, column: 44 },
  });
  const column = lines[5]!.indexOf("172.20.0.2");
  expect(await target(5, column + 2)).toMatchObject({
    value: { kind: "ip", ip: "172.20.0.2" },
    range: { line: 6, column: column + 1 },
  });
});

it("rejects comments and prefix literals", async () => {
  expect(await target(4, 40)).toBeNull();
  expect(await target(1, 13)).toBeNull();
  expect(await target(1, 28)).toBeNull();
  expect(await target(2, 14)).toBeNull();
  expect(await target(3, 11)).toBeNull();
});

it("parses only after a candidate resolves", async () => {
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

  const seen: Dn42HoverCandidate[] = [];
  const unresolved = (candidate: Dn42HoverCandidate) => {
    seen.push(candidate);
    return undefined;
  };
  expect(await target(0, 31, unresolved)).toBeNull();
  expect(await target(0, 45, unresolved)).toBeNull();
  expect(seen.map((candidate) => candidate.kind)).toEqual(["ip", "asn"]);
  expect(findNetworkLiteralAt).not.toHaveBeenCalled();

  await target(0, 31);
  expect(findNetworkLiteralAt).toHaveBeenCalledTimes(1);
});
