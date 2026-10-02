import { describe, expect, it } from "vitest";
import type { Node } from "web-tree-sitter";
import { getParser } from "../src/runtime.js";

interface BinaryShape {
  operator: string;
  left: BinaryShape | string;
  right: BinaryShape | string;
}

const shapeOf = (node: Node): BinaryShape | string => {
  if (node.type === "simple_expression" && node.namedChildCount === 1) {
    const [child] = node.namedChildren;
    if (child) {
      return shapeOf(child);
    }
  }

  if (node.type !== "binary_expression") {
    return node.text;
  }

  const operator = node.childForFieldName("operator");
  const left = node.childForFieldName("left");
  const right = node.childForFieldName("right");
  if (!operator || !left || !right) {
    throw new Error(`Incomplete binary expression: ${node.text}`);
  }

  return {
    operator: operator.text,
    left: shapeOf(left),
    right: shapeOf(right),
  };
};

const parseCondition = async (
  condition: string,
): Promise<BinaryShape | string> => {
  const parser = await getParser();
  const tree = parser.parse(
    `protocol static s {\n  ipv4 {\n    export where ${condition};\n  };\n}\n`,
  );
  if (!tree) {
    throw new Error("Parser returned no tree");
  }

  expect(tree.rootNode.hasError).toBe(false);

  const [whereClause] = tree.rootNode.descendantsOfType("where_clause");
  const outermost = whereClause
    ?.childForFieldName("where_expression")
    ?.descendantsOfType("binary_expression")[0];
  if (!outermost) {
    throw new Error(`No binary expression in: ${condition}`);
  }

  return shapeOf(outermost);
};

describe("@birdcc/parser operator precedence", () => {
  it("binds arithmetic tighter than comparison", async () => {
    expect(await parseCondition("a + 1 > b * 2")).toEqual({
      operator: ">",
      left: { operator: "+", left: "a", right: "1" },
      right: { operator: "*", left: "b", right: "2" },
    });
  });

  it("binds multiplication tighter than addition", async () => {
    expect(await parseCondition("a + b * c - d = 0")).toEqual({
      operator: "=",
      left: {
        operator: "-",
        left: {
          operator: "+",
          left: "a",
          right: { operator: "*", left: "b", right: "c" },
        },
        right: "d",
      },
      right: "0",
    });
  });

  it("keeps comparisons below logical operators", async () => {
    expect(await parseCondition("a + 1 = b && c < d")).toEqual({
      operator: "&&",
      left: {
        operator: "=",
        left: { operator: "+", left: "a", right: "1" },
        right: "b",
      },
      right: { operator: "<", left: "c", right: "d" },
    });
  });
});
