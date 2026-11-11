import { describe, expect, it } from "vitest";

import { permissionsForRole } from "@/features/documents/access";

describe("permissionsForRole", () => {
  it("gives owners full control including sharing", () => {
    expect(permissionsForRole("owner")).toEqual({
      canEdit: true,
      canRename: true,
      canDelete: true,
      canShare: true,
    });
  });

  it("allows editors to edit but not rename, delete, or share", () => {
    expect(permissionsForRole("editor")).toEqual({
      canEdit: true,
      canRename: false,
      canDelete: false,
      canShare: false,
    });
  });

  it("keeps viewers read-only", () => {
    expect(permissionsForRole("viewer")).toEqual({
      canEdit: false,
      canRename: false,
      canDelete: false,
      canShare: false,
    });
  });
});
