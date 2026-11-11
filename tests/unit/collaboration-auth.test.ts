import { describe, expect, it } from "vitest";
import { z } from "zod";

import { colorForUserId } from "@/features/collaboration/types";
import { getCollabWsUrl, isCollaborationEnabled } from "@/features/collaboration/env";

const documentIdSchema = z.string().uuid();

describe("collaboration helpers", () => {
  it("accepts document UUIDs and rejects invalid room names", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(documentIdSchema.safeParse(id).success).toBe(true);
    expect(documentIdSchema.safeParse("not-a-uuid").success).toBe(false);
    expect(documentIdSchema.safeParse("../etc/passwd").success).toBe(false);
  });

  it("assigns stable cursor colors per user id", () => {
    const a = colorForUserId("user-a");
    const b = colorForUserId("user-a");
    expect(a).toBe(b);
    expect(a).toMatch(/^#/);
  });

  it("reads collaboration websocket configuration", () => {
    const url = getCollabWsUrl();
    if (url) {
      expect(isCollaborationEnabled()).toBe(true);
      expect(url.endsWith("/")).toBe(false);
    } else {
      expect(isCollaborationEnabled()).toBe(false);
    }
  });
});
