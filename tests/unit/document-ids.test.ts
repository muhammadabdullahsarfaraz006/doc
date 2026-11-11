import { describe, expect, it } from "vitest";

import { documentTitleSchema } from "@/lib/validation/documents";
import { uuidSchema } from "@/lib/validation/ids";

describe("uuidSchema", () => {
  it("accepts a uuid", () => {
    expect(uuidSchema.parse("550e8400-e29b-41d4-a716-446655440000")).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });

  it("rejects non-uuid values", () => {
    expect(() => uuidSchema.parse("not-a-uuid")).toThrow();
  });
});

describe("documentTitleSchema", () => {
  it("trims and accepts titles", () => {
    expect(documentTitleSchema.parse("  Notes  ")).toBe("Notes");
  });
});
