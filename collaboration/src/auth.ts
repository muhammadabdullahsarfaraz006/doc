import { z } from "zod";

import { getAdminClient } from "./supabase.js";

export const documentIdSchema = z.string().uuid();

export type DocumentAccessRole = "owner" | "editor" | "viewer";

export type AuthenticatedCollaborator = {
  userId: string;
  email: string;
  name: string;
  role: DocumentAccessRole;
  color: string;
};

const CURSOR_COLORS = [
  "#2563eb",
  "#dc2626",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#4f46e5",
] as const;

export function colorForUserId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return CURSOR_COLORS[hash % CURSOR_COLORS.length] ?? CURSOR_COLORS[0];
}

export async function verifyAccessToken(token: string): Promise<{
  userId: string;
  email: string;
}> {
  if (!token || token.trim().length === 0) {
    throw new Error("Authentication required");
  }

  const admin = getAdminClient();
  const { data, error } = await admin.auth.getUser(token);

  if (error || !data.user) {
    throw new Error("Invalid or expired token");
  }

  return {
    userId: data.user.id,
    email: data.user.email ?? "",
  };
}

export async function resolveDocumentRole(
  documentId: string,
  userId: string,
): Promise<DocumentAccessRole | null> {
  const admin = getAdminClient();

  const { data: document, error: documentError } = await admin
    .from("documents")
    .select("owner_id")
    .eq("id", documentId)
    .maybeSingle();

  if (documentError) {
    throw new Error("Failed to resolve document access");
  }

  if (!document) {
    return null;
  }

  if (document.owner_id === userId) {
    return "owner";
  }

  const { data: membership, error: memberError } = await admin
    .from("document_members")
    .select("role")
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (memberError) {
    throw new Error("Failed to resolve document membership");
  }

  if (!membership) {
    return null;
  }

  if (membership.role === "editor" || membership.role === "viewer") {
    return membership.role;
  }

  return null;
}

export async function loadCollaboratorContext(
  documentId: string,
  token: string,
): Promise<AuthenticatedCollaborator> {
  const parsedDocumentId = documentIdSchema.safeParse(documentId);
  if (!parsedDocumentId.success) {
    throw new Error("Invalid document id");
  }

  const { userId, email } = await verifyAccessToken(token);
  const role = await resolveDocumentRole(parsedDocumentId.data, userId);

  if (!role) {
    throw new Error("Not authorized for this document");
  }

  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, email, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  const name =
    profile?.full_name?.trim() ||
    profile?.email?.trim() ||
    email.trim() ||
    "Collaborator";

  return {
    userId,
    email: profile?.email?.trim() || email,
    name,
    role,
    color: colorForUserId(userId),
  };
}

export function roleIsWritable(role: DocumentAccessRole): boolean {
  return role === "owner" || role === "editor";
}
