import type { DocumentAccessRole } from "@/types/database";

export function permissionsForRole(role: DocumentAccessRole): {
  canEdit: boolean;
  canRename: boolean;
  canDelete: boolean;
  canShare: boolean;
} {
  switch (role) {
    case "owner":
      return {
        canEdit: true,
        canRename: true,
        canDelete: true,
        canShare: true,
      };
    case "editor":
      return {
        canEdit: true,
        canRename: false,
        canDelete: false,
        canShare: false,
      };
    case "viewer":
      return {
        canEdit: false,
        canRename: false,
        canDelete: false,
        canShare: false,
      };
  }
}
