import { z } from "zod";

export const MAX_DATABASE_RECORDS = 1_000_000;
export const MAX_DATABASE_BYTES = 32 * 1024 * 1024;

export const asnDatabaseSchema = z
  .tuple([
    z
      .array(z.number().int().min(0).max(0xffff_ffff))
      .min(1)
      .max(MAX_DATABASE_RECORDS),
    z.array(z.string()),
    z.array(z.string()),
    z.array(z.string().regex(/^(?:[A-Z]{2})?$/u)),
  ])
  .superRefine(([asns, names, classes, ccs], context) => {
    for (const [index, column] of [names, classes, ccs].entries()) {
      if (column.length !== asns.length) {
        context.addIssue({
          code: "custom",
          path: [index + 1],
          message: "Database columns must have equal lengths",
        });
        return;
      }
    }
    for (let index = 1; index < asns.length; index += 1) {
      if (asns[index] <= asns[index - 1]) {
        context.addIssue({
          code: "custom",
          path: [0, index],
          message: "ASNs must be unique and sorted in ascending numeric order",
        });
        return;
      }
    }
  });
