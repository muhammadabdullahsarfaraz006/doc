import { describe, expect, it } from "vitest";

import { createCommentThreadSchema } from "@/lib/validation/comments";
import {
  completeSuggestionSchema,
  createSuggestionSchema,
  failSuggestionSchema,
} from "@/lib/validation/suggestions";

const uuid = "11111111-1111-4111-8111-111111111111";
const bytea = "\\xdeadbeef";

describe("comment validation", () => {
  it("accepts a valid create-thread payload", () => {
    const parsed = createCommentThreadSchema.safeParse({
      documentId: uuid,
      body: "Looks good",
      selectedTextSnapshot: "paragraph",
      anchorStart: bytea,
      anchorEnd: bytea,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects empty bodies and invalid anchors", () => {
    expect(
      createCommentThreadSchema.safeParse({
        documentId: uuid,
        body: " ",
        anchorStart: bytea,
        anchorEnd: bytea,
      }).success,
    ).toBe(false);

    expect(
      createCommentThreadSchema.safeParse({
        documentId: uuid,
        body: "ok",
        anchorStart: "not-bytea",
        anchorEnd: bytea,
      }).success,
    ).toBe(false);
  });
});

describe("suggestion validation", () => {
  it("accepts replacement suggestions", () => {
    const parsed = createSuggestionSchema.safeParse({
      documentId: uuid,
      suggestionType: "replacement",
      originalText: "old",
      proposedContent: { text: "new" },
      anchorStart: bytea,
      anchorEnd: bytea,
    });
    expect(parsed.success).toBe(true);
  });

  it("requires application id for complete/fail", () => {
    expect(
      completeSuggestionSchema.safeParse({
        suggestionId: uuid,
        applicationId: uuid,
      }).success,
    ).toBe(true);

    expect(
      failSuggestionSchema.safeParse({
        suggestionId: uuid,
        applicationId: uuid,
        conflictReason: "mismatch",
      }).success,
    ).toBe(true);

    expect(
      failSuggestionSchema.safeParse({
        suggestionId: uuid,
        applicationId: uuid,
        conflictReason: "",
      }).success,
    ).toBe(false);
  });
});
