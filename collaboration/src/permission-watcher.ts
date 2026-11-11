import type { RealtimeChannel } from "@supabase/supabase-js";

import {
  resolveDocumentRole,
  roleIsWritable,
  type DocumentAccessRole,
} from "./auth.js";
import { connectionRegistry } from "./connection-registry.js";
import { getAdminClient } from "./supabase.js";

const RECHECK_INTERVAL_MS = 8_000;

async function applyRoleChange(
  documentId: string,
  userId: string,
  nextRole: DocumentAccessRole | null,
): Promise<void> {
  if (nextRole == null) {
    connectionRegistry.disconnectUser(documentId, userId);
    return;
  }

  if (!roleIsWritable(nextRole)) {
    connectionRegistry.forceReadOnly(documentId, userId);
    return;
  }

  for (const entry of connectionRegistry.listForDocument(documentId)) {
    if (entry.userId === userId) {
      connectionRegistry.updateRole(entry.connectionId, nextRole);
    }
  }
}

export async function recheckDocumentPermissions(
  documentId: string,
): Promise<void> {
  const entries = connectionRegistry.listForDocument(documentId);
  if (entries.length === 0) {
    return;
  }

  const seenUsers = new Set<string>();
  for (const entry of entries) {
    if (seenUsers.has(entry.userId)) {
      continue;
    }
    seenUsers.add(entry.userId);

    try {
      const role = await resolveDocumentRole(documentId, entry.userId);
      if (role === entry.role) {
        // Still ensure readOnly flag matches role (defense in depth).
        if (!roleIsWritable(role)) {
          connectionRegistry.forceReadOnly(documentId, entry.userId);
        }
        continue;
      }
      await applyRoleChange(documentId, entry.userId, role);
    } catch {
      // On lookup failure, fail closed for this user.
      connectionRegistry.disconnectUser(documentId, entry.userId);
    }
  }
}

export function startPermissionWatcher(): () => void {
  const admin = getAdminClient();
  const channels: RealtimeChannel[] = [];

  const membersChannel = admin
    .channel("collab-document-members")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "document_members" },
      async (payload) => {
        const row = (payload.new ?? payload.old) as {
          document_id?: string;
          user_id?: string;
          role?: string;
        } | null;

        const documentId = row?.document_id;
        if (!documentId) {
          return;
        }

        if (payload.eventType === "DELETE" && row?.user_id) {
          connectionRegistry.disconnectUser(documentId, row.user_id);
          return;
        }

        await recheckDocumentPermissions(documentId);
      },
    )
    .subscribe();

  channels.push(membersChannel);

  const documentsChannel = admin
    .channel("collab-documents-owners")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "documents" },
      async (payload) => {
        const documentId = (payload.new as { id?: string } | null)?.id;
        if (!documentId) {
          return;
        }
        await recheckDocumentPermissions(documentId);
      },
    )
    .subscribe();

  channels.push(documentsChannel);

  const interval = setInterval(() => {
    void (async () => {
      for (const documentId of connectionRegistry.listDocumentIds()) {
        await recheckDocumentPermissions(documentId);
      }
    })();
  }, RECHECK_INTERVAL_MS);

  return () => {
    clearInterval(interval);
    for (const channel of channels) {
      void admin.removeChannel(channel);
    }
  };
}
