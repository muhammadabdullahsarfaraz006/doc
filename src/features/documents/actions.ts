"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { permissionsForRole } from "@/features/documents/access";
import { createClient } from "@/lib/supabase/server";
import {
  autosaveDocumentSchema,
  documentTitleSchema,
  renameDocumentSchema,
} from "@/lib/validation/documents";
import { uuidSchema } from "@/lib/validation/ids";
import {
  normalizeTipTapDocument,
  tipTapDocumentSchema,
} from "@/lib/validation/tiptap";
import type {
  Document,
  DocumentAccessRole,
  DocumentRole,
  Json,
} from "@/types/database";

export type DocumentActionState = {
  error?: string;
  success?: string;
  title?: string;
  revision?: number;
};

export type DocumentLoadResult =
  | {
      ok: true;
      document: Document;
      role: DocumentAccessRole;
      canEdit: boolean;
      canRename: boolean;
      canDelete: boolean;
      canShare: boolean;
    }
  | {
      ok: false;
      unauthorized: boolean;
      error: string;
    };

export type SaveDocumentResult =
  | {
      ok: true;
      revision: number;
    }
  | {
      ok: false;
      code:
        | "unauthorized"
        | "forbidden"
        | "conflict"
        | "not_found"
        | "validation"
        | "unknown";
      message: string;
      currentRevision?: number;
    };

export type RenameDocumentResult =
  | {
      ok: true;
      title: string;
      revision: number;
    }
  | {
      ok: false;
      code: "unauthorized" | "forbidden" | "conflict" | "validation" | "unknown";
      message: string;
      currentRevision?: number;
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

async function resolveAccessRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  document: Document,
  userId: string,
): Promise<DocumentAccessRole | null> {
  if (document.owner_id === userId) {
    return "owner";
  }

  const { data: membership, error } = await supabase
    .from("document_members")
    .select("role")
    .eq("document_id", document.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !membership) {
    return null;
  }

  if (membership.role === "editor" || membership.role === "viewer") {
    return membership.role as DocumentRole;
  }

  return null;
}

/**
 * Inserts without Prefer: return=representation.
 * Phase 1 SELECT policy helper evaluation fails on INSERT...RETURNING;
 * client-generated id + follow-up SELECT avoids that PostgREST path.
 */
export async function createDocumentAction(): Promise<DocumentActionState> {
  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { error: error ?? "Unauthorized" };
  }

  const id = crypto.randomUUID();
  const title = documentTitleSchema.parse("Untitled document");

  const { error: insertError } = await supabase.from("documents").insert({
    id,
    title,
    owner_id: user.id,
  });

  if (insertError) {
    return {
      error: insertError.message || "Could not create document.",
    };
  }

  const { data: created, error: fetchError } = await supabase
    .from("documents")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !created) {
    return {
      error:
        fetchError?.message ||
        "Document was created but could not be loaded. Refresh and try opening it from the list.",
    };
  }

  revalidatePath("/dashboard");
  redirect(`/documents/${created.id}`);
}

export async function renameDocument(input: {
  documentId: string;
  title: string;
  expectedRevision: number;
}): Promise<RenameDocumentResult> {
  const idResult = uuidSchema.safeParse(input.documentId);
  if (!idResult.success) {
    return { ok: false, code: "validation", message: "Invalid document id." };
  }

  const parsed = renameDocumentSchema.safeParse({ title: input.title });
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: parsed.error.issues[0]?.message ?? "Invalid title",
    };
  }

  if (
    !Number.isInteger(input.expectedRevision) ||
    input.expectedRevision < 1
  ) {
    return {
      ok: false,
      code: "validation",
      message: "Invalid document revision.",
    };
  }

  const { supabase, user, error } = await requireUser();
  if (!user) {
    return {
      ok: false,
      code: "unauthorized",
      message: error ?? "Unauthorized",
    };
  }

  const { data, error: updateError } = await supabase
    .from("documents")
    .update({
      title: parsed.data.title,
      revision: input.expectedRevision + 1,
    })
    .eq("id", idResult.data)
    .eq("revision", input.expectedRevision)
    .eq("owner_id", user.id)
    .select("id, title, revision")
    .maybeSingle();

  if (updateError) {
    const message = updateError.message.includes("Only the document owner")
      ? "Only the document owner can rename this document."
      : updateError.message || "Could not rename document.";

    return {
      ok: false,
      code: updateError.message.includes("Only the document owner")
        ? "forbidden"
        : "unknown",
      message,
    };
  }

  if (!data) {
    const { data: current } = await supabase
      .from("documents")
      .select("id, revision, owner_id")
      .eq("id", idResult.data)
      .maybeSingle();

    if (!current) {
      return {
        ok: false,
        code: "forbidden",
        message: "Document unavailable.",
      };
    }

    if (current.owner_id !== user.id) {
      return {
        ok: false,
        code: "forbidden",
        message: "Only the document owner can rename this document.",
      };
    }

    return {
      ok: false,
      code: "conflict",
      message:
        "This document changed since you loaded it. Refresh and try renaming again.",
      currentRevision: current.revision,
    };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/documents/${idResult.data}`);
  return {
    ok: true,
    title: data.title,
    revision: data.revision,
  };
}

export async function renameDocumentAction(
  _prev: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const result = await renameDocument({
    documentId: String(formData.get("documentId") ?? ""),
    title: String(formData.get("title") ?? ""),
    expectedRevision: Number(formData.get("revision")),
  });

  if (!result.ok) {
    return { error: result.message };
  }

  return {
    success: "Document renamed.",
    title: result.title,
    revision: result.revision,
  };
}

export async function deleteDocumentAction(
  _prev: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const idResult = uuidSchema.safeParse(formData.get("documentId"));
  if (!idResult.success) {
    return { error: "Invalid document id." };
  }

  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { error: error ?? "Unauthorized" };
  }

  const { data, error: deleteError } = await supabase
    .from("documents")
    .delete()
    .eq("id", idResult.data)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle();

  if (deleteError) {
    return { error: deleteError.message || "Could not delete document." };
  }

  if (!data) {
    return {
      error:
        "Could not delete document. Only owners can delete, or the document no longer exists.",
    };
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function getOwnedDocuments(): Promise<{
  documents: Document[];
  error: string | null;
}> {
  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { documents: [], error: error ?? "Unauthorized" };
  }

  const { data, error: queryError } = await supabase
    .from("documents")
    .select("*")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  if (queryError) {
    return { documents: [], error: queryError.message };
  }

  return { documents: data ?? [], error: null };
}

export async function getDocumentForUser(
  documentId: string,
): Promise<DocumentLoadResult> {
  const idResult = uuidSchema.safeParse(documentId);
  if (!idResult.success) {
    return {
      ok: false,
      unauthorized: false,
      error: "Invalid document id.",
    };
  }

  const { supabase, user, error } = await requireUser();
  if (!user) {
    return {
      ok: false,
      unauthorized: true,
      error: error ?? "Unauthorized",
    };
  }

  const { data, error: queryError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", idResult.data)
    .maybeSingle();

  if (queryError) {
    return {
      ok: false,
      unauthorized: false,
      error: "Could not load document.",
    };
  }

  if (!data) {
    return {
      ok: false,
      unauthorized: true,
      error: "Document unavailable.",
    };
  }

  const role = await resolveAccessRole(supabase, data, user.id);
  if (!role) {
    return {
      ok: false,
      unauthorized: true,
      error: "Document unavailable.",
    };
  }

  const permissions = permissionsForRole(role);

  return {
    ok: true,
    document: {
      ...data,
      content: normalizeTipTapDocument(data.content) as NonNullable<Json>,
    },
    role,
    ...permissions,
  };
}

/**
 * Conditional content autosave.
 * Success requires a returned row proving expectedRevision was updated.
 */
export async function saveDocumentContent(input: {
  documentId: string;
  content: unknown;
  expectedRevision: number;
}): Promise<SaveDocumentResult> {
  const idResult = uuidSchema.safeParse(input.documentId);
  if (!idResult.success) {
    return { ok: false, code: "validation", message: "Invalid document id." };
  }

  const parsedPayload = autosaveDocumentSchema.safeParse({
    content: input.content,
    expectedRevision: input.expectedRevision,
  });
  if (!parsedPayload.success) {
    return {
      ok: false,
      code: "validation",
      message: parsedPayload.error.issues[0]?.message ?? "Invalid save payload",
    };
  }

  const contentResult = tipTapDocumentSchema.safeParse(
    parsedPayload.data.content,
  );
  if (!contentResult.success) {
    return {
      ok: false,
      code: "validation",
      message: "Document content is invalid.",
    };
  }

  const { supabase, user, error } = await requireUser();
  if (!user) {
    return {
      ok: false,
      code: "unauthorized",
      message: error ?? "Unauthorized",
    };
  }

  const { data, error: updateError } = await supabase
    .from("documents")
    .update({
      content: contentResult.data as NonNullable<Json>,
      revision: parsedPayload.data.expectedRevision + 1,
    })
    .eq("id", idResult.data)
    .eq("revision", parsedPayload.data.expectedRevision)
    .select("id, revision")
    .maybeSingle();

  if (updateError) {
    if (updateError.message.includes("Only the document owner")) {
      return {
        ok: false,
        code: "forbidden",
        message: "You do not have permission to edit this document.",
      };
    }

    return {
      ok: false,
      code: "unknown",
      message: updateError.message || "Could not save document.",
    };
  }

  if (data) {
    revalidatePath("/dashboard");
    revalidatePath(`/documents/${idResult.data}`);
    return { ok: true, revision: data.revision };
  }

  const { data: current, error: currentError } = await supabase
    .from("documents")
    .select("id, revision, owner_id")
    .eq("id", idResult.data)
    .maybeSingle();

  if (currentError) {
    return {
      ok: false,
      code: "unknown",
      message: "Could not verify document state after save failure.",
    };
  }

  if (!current) {
    return {
      ok: false,
      code: "not_found",
      message: "Document unavailable.",
    };
  }

  if (current.revision !== parsedPayload.data.expectedRevision) {
    return {
      ok: false,
      code: "conflict",
      message:
        "This document was updated elsewhere. Your local edits were kept and were not overwritten.",
      currentRevision: current.revision,
    };
  }

  return {
    ok: false,
    code: "forbidden",
    message: "You do not have permission to edit this document.",
    currentRevision: current.revision,
  };
}
