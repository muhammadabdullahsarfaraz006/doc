"use server";

import { revalidatePath } from "next/cache";

import { mapSharingRpcError } from "@/features/sharing/errors";
import { createClient } from "@/lib/supabase/server";
import {
  removeCollaboratorSchema,
  shareDocumentByEmailSchema,
  updateCollaboratorRoleSchema,
} from "@/lib/validation/documents";
import { uuidSchema } from "@/lib/validation/ids";
import type { Collaborator, DocumentRole } from "@/types/database";

export type SharingActionResult<T = undefined> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: string;
      message: string;
    };

export type SharedDocumentItem = {
  id: string;
  title: string;
  updated_at: string;
  role: DocumentRole;
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      supabase,
      user: null,
      error: "Your session has expired. Please sign in again.",
    };
  }

  return { supabase, user, error: null };
}

function toCollaborator(row: {
  member_id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  created_at?: string;
}): Collaborator | null {
  if (row.role !== "editor" && row.role !== "viewer") {
    return null;
  }

  return {
    member_id: row.member_id,
    user_id: row.user_id,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    created_at: row.created_at,
  };
}

export async function listCollaboratorsAction(
  documentId: string,
): Promise<SharingActionResult<Collaborator[]>> {
  const idResult = uuidSchema.safeParse(documentId);
  if (!idResult.success) {
    return { ok: false, code: "validation", message: "Invalid document id." };
  }

  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { ok: false, code: "unauthorized", message: error ?? "Unauthorized" };
  }

  const { data, error: rpcError } = await supabase.rpc(
    "list_document_collaborators",
    { p_document_id: idResult.data },
  );

  if (rpcError) {
    const mapped = mapSharingRpcError(rpcError.message);
    return { ok: false, code: mapped.code, message: mapped.message };
  }

  const collaborators = (data ?? [])
    .map(toCollaborator)
    .filter((item): item is Collaborator => item !== null);

  return { ok: true, data: collaborators };
}

export async function shareDocumentAction(input: {
  documentId: string;
  email: string;
  role: DocumentRole;
}): Promise<SharingActionResult<Collaborator>> {
  const parsed = shareDocumentByEmailSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: parsed.error.issues[0]?.message ?? "Invalid sharing details",
    };
  }

  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { ok: false, code: "unauthorized", message: error ?? "Unauthorized" };
  }

  const { data, error: rpcError } = await supabase.rpc("share_document_by_email", {
    p_document_id: parsed.data.documentId,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
  });

  if (rpcError) {
    const mapped = mapSharingRpcError(rpcError.message);
    return { ok: false, code: mapped.code, message: mapped.message };
  }

  const row = data?.[0];
  const collaborator = row ? toCollaborator(row) : null;
  if (!collaborator) {
    return {
      ok: false,
      code: "unknown",
      message: "Share succeeded but collaborator details were unavailable.",
    };
  }

  revalidatePath(`/documents/${parsed.data.documentId}`);
  revalidatePath("/shared");
  revalidatePath("/dashboard");

  return { ok: true, data: collaborator };
}

export async function updateCollaboratorRoleAction(input: {
  memberId: string;
  role: DocumentRole;
  documentId: string;
}): Promise<SharingActionResult<Collaborator>> {
  const parsed = updateCollaboratorRoleSchema.safeParse({
    memberId: input.memberId,
    role: input.role,
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: parsed.error.issues[0]?.message ?? "Invalid role update",
    };
  }

  const documentIdResult = uuidSchema.safeParse(input.documentId);
  if (!documentIdResult.success) {
    return { ok: false, code: "validation", message: "Invalid document id." };
  }

  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { ok: false, code: "unauthorized", message: error ?? "Unauthorized" };
  }

  const { data, error: rpcError } = await supabase.rpc(
    "update_document_member_role",
    {
      p_member_id: parsed.data.memberId,
      p_role: parsed.data.role,
    },
  );

  if (rpcError) {
    const mapped = mapSharingRpcError(rpcError.message);
    return { ok: false, code: mapped.code, message: mapped.message };
  }

  const row = data?.[0];
  const collaborator = row ? toCollaborator(row) : null;
  if (!collaborator) {
    return {
      ok: false,
      code: "unknown",
      message: "Role updated but collaborator details were unavailable.",
    };
  }

  revalidatePath(`/documents/${documentIdResult.data}`);
  revalidatePath("/shared");

  return { ok: true, data: collaborator };
}

export async function removeCollaboratorAction(input: {
  memberId: string;
  documentId: string;
}): Promise<SharingActionResult> {
  const parsed = removeCollaboratorSchema.safeParse({
    memberId: input.memberId,
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: parsed.error.issues[0]?.message ?? "Invalid collaborator",
    };
  }

  const documentIdResult = uuidSchema.safeParse(input.documentId);
  if (!documentIdResult.success) {
    return { ok: false, code: "validation", message: "Invalid document id." };
  }

  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { ok: false, code: "unauthorized", message: error ?? "Unauthorized" };
  }

  const { error: rpcError } = await supabase.rpc("remove_document_member", {
    p_member_id: parsed.data.memberId,
  });

  if (rpcError) {
    const mapped = mapSharingRpcError(rpcError.message);
    return { ok: false, code: mapped.code, message: mapped.message };
  }

  revalidatePath(`/documents/${documentIdResult.data}`);
  revalidatePath("/shared");
  revalidatePath("/dashboard");

  return { ok: true, data: undefined };
}

/**
 * Lists documents shared with the current user (membership only, not owned).
 * Owner identity is intentionally omitted — profiles are not broadly readable.
 */
export async function getSharedDocuments(): Promise<{
  documents: SharedDocumentItem[];
  error: string | null;
}> {
  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { documents: [], error: error ?? "Unauthorized" };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("document_members")
    .select("document_id, role")
    .eq("user_id", user.id);

  if (membershipError) {
    return { documents: [], error: membershipError.message };
  }

  if (!memberships || memberships.length === 0) {
    return { documents: [], error: null };
  }

  const roleByDocumentId = new Map<string, DocumentRole>();
  for (const membership of memberships) {
    if (membership.role === "editor" || membership.role === "viewer") {
      roleByDocumentId.set(membership.document_id, membership.role);
    }
  }

  const documentIds = [...roleByDocumentId.keys()];
  if (documentIds.length === 0) {
    return { documents: [], error: null };
  }

  const { data: documents, error: documentsError } = await supabase
    .from("documents")
    .select("id, title, updated_at, owner_id")
    .in("id", documentIds)
    .neq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  if (documentsError) {
    return { documents: [], error: documentsError.message };
  }

  const items: SharedDocumentItem[] = (documents ?? [])
    .map((document) => {
      const role = roleByDocumentId.get(document.id);
      if (!role) {
        return null;
      }
      return {
        id: document.id,
        title: document.title,
        updated_at: document.updated_at,
        role,
      };
    })
    .filter((item): item is SharedDocumentItem => item !== null);

  return { documents: items, error: null };
}
