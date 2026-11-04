import { expect, it } from "vitest";
import { createParsedDocumentCache } from "../src/parsed-document-cache.js";

it("accounts for concurrent replacement of one URI at the byte-budget boundary", async () => {
  const uri = "file:///cache/shared.conf";
  const textA = `define A = 1;\n#${"a".repeat(16)}`;
  const textB = `define B = 2;\n#${"b".repeat(36)}`;
  const other = `define C = 3;\n#${"c".repeat(14)}`;
  const cache = createParsedDocumentCache({
    maxEntries: 2,
    maxBytes: Buffer.byteLength(textB) + Buffer.byteLength(other),
  });
  await cache.parse(uri, "#seed\n");
  const [first, second] = await Promise.all([
    cache.parse(uri, textA),
    cache.parse(uri, textB),
  ]);
  expect(first.parsed.program.declarations[0]).toMatchObject({
    kind: "define",
    name: "A",
  });
  expect(second.parsed.program.declarations[0]).toMatchObject({
    kind: "define",
    name: "B",
  });
  const settled = await cache.parse(uri, textB);
  await cache.parse("file:///cache/other.conf", other);
  const atLimit = await cache.parse(uri, textB);
  expect(atLimit.cacheHit).toBe(true);
  expect(atLimit.parsed).toBe(settled.parsed);
  await cache.parse("file:///cache/third.conf", "#third\n");
  expect((await cache.parse("file:///cache/other.conf", other)).cacheHit).toBe(
    true,
  );
  expect((await cache.parse(uri, textB)).cacheHit).toBe(false);
});

it("enforces the entry limit and leaves unrelated entries when an item is too large", async () => {
  const cache = createParsedDocumentCache({ maxEntries: 2, maxBytes: 100 });
  await cache.parse("file:///cache/one.conf", "#one\n");
  await cache.parse("file:///cache/two.conf", "#two\n");
  await cache.parse("file:///cache/three.conf", "#three\n");
  expect((await cache.parse("file:///cache/two.conf", "#two\n")).cacheHit).toBe(
    true,
  );
  expect(
    (await cache.parse("file:///cache/huge.conf", `#${"x".repeat(100)}`))
      .cacheHit,
  ).toBe(false);
  expect((await cache.parse("file:///cache/two.conf", "#two\n")).cacheHit).toBe(
    true,
  );
  expect((await cache.parse("file:///cache/one.conf", "#one\n")).cacheHit).toBe(
    false,
  );
});
