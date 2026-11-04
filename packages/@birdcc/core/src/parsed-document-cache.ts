import { parseBirdConfig, type ParsedBirdDocument } from "@birdcc/parser";

export const createParsedDocumentCache = (limits: {
  maxEntries: number;
  maxBytes: number;
}) => {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error(`${name} must be a positive safe integer`);
  }
  const entries = new Map<
    string,
    { text: string; parsed: ParsedBirdDocument; bytes: number }
  >();
  let retainedBytes = 0;
  return {
    parse: async (
      uri: string,
      text: string,
    ): Promise<{ parsed: ParsedBirdDocument; cacheHit: boolean }> => {
      const cached = entries.get(uri);
      if (cached?.text === text)
        return { parsed: cached.parsed, cacheHit: true };
      const parsed = await parseBirdConfig(text);
      const bytes = Buffer.byteLength(text, "utf8");
      const current = entries.get(uri);
      if (current) {
        retainedBytes -= current.bytes;
        entries.delete(uri);
      }
      if (bytes > limits.maxBytes) return { parsed, cacheHit: false };
      while (
        entries.size > 0 &&
        (entries.size >= limits.maxEntries ||
          retainedBytes + bytes > limits.maxBytes)
      ) {
        const oldest = entries.keys().next().value!;
        retainedBytes -= entries.get(oldest)!.bytes;
        entries.delete(oldest);
      }
      entries.set(uri, { text, parsed, bytes });
      retainedBytes += bytes;
      return { parsed, cacheHit: false };
    },
  };
};
