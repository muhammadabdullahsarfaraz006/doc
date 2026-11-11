import { describe, expect, it } from "vitest";

import {
  autosaveDocumentSchema,
  documentTitleSchema,
  shareDocumentSchema,
} from "@/lib/validation/documents";
import { validateImportFileMeta } from "@/lib/validation/import";

describe("documentTitleSchema", () => {
  it("accepts a trimmed non-empty title", () => {
    expect(documentTitleSchema.parse("  Meeting notes  ")).toBe("Meeting notes");
  });

  it("rejects blank titles", () => {
    expect(() => documentTitleSchema.parse("   ")).toThrow();
  });
});

describe("autosaveDocumentSchema", () => {
  it("requires a positive expectedRevision for optimistic concurrency", () => {
    const parsed = autosaveDocumentSchema.parse({
      content: { type: "doc", content: [] },
      expectedRevision: 3,
    });

    expect(parsed.expectedRevision).toBe(3);
  });

  it("rejects non-positive revisions", () => {
    expect(() =>
      autosaveDocumentSchema.parse({
        content: {},
        expectedRevision: 0,
      }),
    ).toThrow();
  });
});

describe("shareDocumentSchema", () => {
  it("normalizes collaborator email", () => {
    expect(
      shareDocumentSchema.parse({
        email: "  Alex@Example.com ",
        role: "viewer",
      }).email,
    ).toBe("alex@example.com");
  });
});

describe("validateImportFileMeta", () => {
  it("accepts a valid markdown file under 2 MB", () => {
    const result = validateImportFileMeta({
      name: "notes.md",
      size: 1024,
      type: "text/markdown",
    });

    expect(result.success).toBe(true);
  });

  it("rejects unsupported extensions", () => {
    const result = validateImportFileMeta({
      name: "image.png",
      size: 100,
      type: "image/png",
    });

    expect(result.success).toBe(false);
  });

  it("rejects files larger than 2 MB", () => {
    const result = validateImportFileMeta({
      name: "big.txt",
      size: 2 * 1024 * 1024 + 1,
      type: "text/plain",
    });

    expect(result.success).toBe(false);
  });
});
