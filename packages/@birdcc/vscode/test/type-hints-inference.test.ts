import { describe, expect, it } from "vitest";

import { collectFunctionReturnHints } from "../src/type-hints/inference.js";

describe("type hints inference", () => {
  it("infers consistent return types for simple functions", async () => {
    const source = `
      function ret_int() -> int {
        return 1;
      }

      function ret_bool() -> bool {
        return true;
      }

      function ret_prefix() -> prefix {
        return net.mask(24);
      }
    `;

    const hints = await collectFunctionReturnHints(source);
    const byName = new Map(hints.map((hint) => [hint.declaration.name, hint]));

    expect(byName.get("ret_int")?.inferredReturnType).toBe("int");
    expect(byName.get("ret_bool")?.inferredReturnType).toBe("bool");
    expect(byName.get("ret_prefix")?.inferredReturnType).toBe("prefix");
  });

  it("marks mixed incompatible return types as unknown", async () => {
    const source = `
      function mixed() -> int {
        return 1;
        return 'x';
      }
    `;

    const hints = await collectFunctionReturnHints(source);
    expect(hints).toHaveLength(1);
    expect(hints[0]?.inferredReturnType).toBe("unknown");
    expect(hints[0]?.returnDetails).toHaveLength(2);
  });

  it("infers bool for return expressions using comparison operators", async () => {
    const source = `
      function less_than() -> bool {
        return 1 < 2;
      }

      function greater_than() -> bool {
        return 4 > 2;
      }

      function pattern_match() -> bool {
        return net ~ [ 10.0.0.0/8+ ];
      }
    `;

    const hints = await collectFunctionReturnHints(source);
    const byName = new Map(hints.map((hint) => [hint.declaration.name, hint]));

    expect(byName.get("less_than")?.inferredReturnType).toBe("bool");
    expect(byName.get("greater_than")?.inferredReturnType).toBe("bool");
    expect(byName.get("pattern_match")?.inferredReturnType).toBe("bool");
  });
});
