import { expect, it } from "vitest";
import { findIpLiteralAt, findNetworkLiteralAt } from "../src/index.js";

it("finds IP tokens without treating comments or strings as addresses", async () => {
  const input = [
    "# 172.20.0.53",
    'define NAME = "172.20.0.53";',
    "protocol bgp example { neighbor 172.20.0.53 as 4242420001; }",
    "protocol bgp example6 { neighbor fd00::1234 as 4242420001; }",
  ].join("\n");
  expect(await findIpLiteralAt(input, { line: 0, character: 5 })).toBeNull();
  expect(await findIpLiteralAt(input, { line: 1, character: 19 })).toBeNull();
  expect(
    await findIpLiteralAt(input, { line: 2, character: 36 }),
  ).toMatchObject({ value: "172.20.0.53" });
  expect(
    await findIpLiteralAt(input, { line: 3, character: 36 }),
  ).toMatchObject({ value: "fd00::1234" });
  const unicode =
    'define LABEL = "🌏"; protocol bgp edge { neighbor 172.20.0.53 as 1; }';
  const character = unicode.indexOf("172.20.0.53") + 3;
  expect(await findIpLiteralAt(unicode, { line: 0, character })).toMatchObject({
    value: "172.20.0.53",
    range: { column: unicode.indexOf("172.20.0.53") + 1 },
  });
});

it("finds integer tokens and excludes multiline comments and strings", async () => {
  const input = [
    "/* neighbor 172.20.0.1 as 4242420001;",
    "local as 4242420001; */",
    'define NAME = "local as 4242420001";',
    "protocol bgp test { neighbor 172.20.0.1 as 4242420001; }",
  ].join("\n");
  expect(
    await findNetworkLiteralAt(input, { line: 1, character: 12 }),
  ).toBeNull();
  expect(
    await findNetworkLiteralAt(input, { line: 2, character: 29 }),
  ).toBeNull();
  expect(
    await findNetworkLiteralAt(input, { line: 3, character: 45 }),
  ).toMatchObject({
    value: "4242420001",
    kind: "number",
  });
  expect(await findIpLiteralAt(input, { line: 3, character: 45 })).toBeNull();
});
