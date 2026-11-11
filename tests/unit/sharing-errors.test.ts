import { describe, expect, it } from "vitest";

import { mapSharingRpcError } from "@/features/sharing/errors";
import {
  shareDocumentByEmailSchema,
  shareDocumentSchema,
} from "@/lib/validation/documents";

describe("shareDocumentSchema", () => {
  it("normalizes email and accepts roles", () => {
    expect(
      shareDocumentSchema.parse({
        email: "  Alex@Example.com ",
        role: "viewer",
      }),
    ).toEqual({
      email: "alex@example.com",
      role: "viewer",
    });
  });

  it("rejects invalid emails", () => {
    expect(() =>
      shareDocumentSchema.parse({
        email: "not-an-email",
        role: "editor",
      }),
    ).toThrow();
  });
});

describe("shareDocumentByEmailSchema", () => {
  it("requires a document id", () => {
    expect(() =>
      shareDocumentByEmailSchema.parse({
        email: "alex@example.com",
        role: "editor",
        documentId: "bad",
      }),
    ).toThrow();
  });
});

describe("mapSharingRpcError", () => {
  it("maps unregistered and duplicate cases", () => {
    expect(
      mapSharingRpcError("No registered user found with that email").code,
    ).toBe("unregistered");
    expect(
      mapSharingRpcError("User already has access to this document").code,
    ).toBe("duplicate");
    expect(
      mapSharingRpcError("You cannot share a document with yourself").code,
    ).toBe("self_share");
    expect(
      mapSharingRpcError("Only the document owner can share").code,
    ).toBe("forbidden");
  });
});
