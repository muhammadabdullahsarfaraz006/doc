"use server";

import { revalidatePath } from "next/cache";

import type {
  CommentReply,
  CommentThread,
  DocumentSuggestion,
} from "@/features/comments/types";
import {
  createCommentReplySchema,
  createCommentThreadSchema,
  markCommentOrphanedSchema,
  threadIdSchema,
  updateCommentReplySchema,
  updateCommentThreadBodySchema,
} from "@/lib/validation/comments";
import {
  completeSuggestionSchema,
  createSuggestionSchema,
  failSuggestionSchema,
  suggestionIdSchema,
} from "@/lib/validation/suggestions";
import { uuidSchema } from "@/lib/validation/ids";
import { createClient } from "@/lib/supabase/server";

export type CommentActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

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

function mapThread(row: Record<string, unknown>): CommentThread {
  return {
    id: String(row.id),
    document_id: String(row.document_id),
    author_id: String(row.author_id),
    author_full_name: String(row.author_full_name ?? ""),
    body: String(row.body),
    selected_text_snapshot: String(row.selected_text_snapshot ?? ""),
    anchor_start: String(row.anchor_start),
    anchor_end: String(row.anchor_end),
    anchor_status:
      row.anchor_status === "orphaned" ? "orphaned" : "active",
    resolved: Boolean(row.resolved),
    resolved_by: row.resolved_by ? String(row.resolved_by) : null,
    resolved_at: row.resolved_at ? String(row.resolved_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapReply(row: Record<string, unknown>): CommentReply {
  return {
    id: String(row.id),
    thread_id: String(row.thread_id),
    author_id: String(row.author_id),
    author_full_name: String(row.author_full_name ?? ""),
    body: String(row.body),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapSuggestion(row: Record<string, unknown>): DocumentSuggestion {
  const proposed =
    row.proposed_content &&
    typeof row.proposed_content === "object" &&
    !Array.isArray(row.proposed_content)
      ? (row.proposed_content as { text?: string })
      : {};

  const status = String(row.status);
  const suggestionType = String(row.suggestion_type);

  return {
    id: String(row.id),
    document_id: String(row.document_id),
    author_id: String(row.author_id),
    author_full_name: String(row.author_full_name ?? ""),
    suggestion_type:
      suggestionType === "insertion" ||
      suggestionType === "deletion" ||
      suggestionType === "replacement"
        ? suggestionType
        : "replacement",
    original_text: String(row.original_text ?? ""),
    proposed_content: { text: proposed.text },
    anchor_start: String(row.anchor_start),
    anchor_end: String(row.anchor_end),
    status:
      status === "applying" ||
      status === "accepted" ||
      status === "rejected" ||
      status === "conflict" ||
      status === "pending"
        ? status
        : "pending",
    application_id: row.application_id ? String(row.application_id) : null,
    claim_expires_at: row.claim_expires_at
      ? String(row.claim_expires_at)
      : null,
    reviewed_by: row.reviewed_by ? String(row.reviewed_by) : null,
    reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
    conflict_reason: row.conflict_reason ? String(row.conflict_reason) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listCommentThreadsAction(
  documentId: string,
): Promise<CommentActionResult<CommentThread[]>> {
  const parsed = uuidSchema.safeParse(documentId);
  if (!parsed.success) {
    return { ok: false, code: "validation", message: "Invalid document id." };
  }

  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { ok: false, code: "unauthorized", message: error ?? "Unauthorized" };
  }

  const { data, error: queryError } = await supabase
    .from("comment_threads")
    .select("*")
    .eq("document_id", parsed.data)
    .order("created_at", { ascending: true });

  if (queryError) {
    return { ok: false, code: "query", message: "Failed to load comments." };
  }

  return {
    ok: true,
    data: (data ?? []).map((row) => mapThread(row as Record<string, unknown>)),
  };
}

export async function listCommentRepliesAction(
  threadId: string,
): Promise<CommentActionResult<CommentReply[]>> {
  const parsed = uuidSchema.safeParse(threadId);
  if (!parsed.success) {
    return { ok: false, code: "validation", message: "Invalid thread id." };
  }

  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { ok: false, code: "unauthorized", message: error ?? "Unauthorized" };
  }

  const { data, error: queryError } = await supabase
    .from("comment_replies")
    .select("*")
    .eq("thread_id", parsed.data)
    .order("created_at", { ascending: true });

  if (queryError) {
    return { ok: false, code: "query", message: "Failed to load replies." };
  }

  return {
    ok: true,
    data: (data ?? []).map((row) => mapReply(row as Record<string, unknown>)),
  };
}

export async function createCommentThreadAction(
  input: unknown,
): Promise<CommentActionResult<CommentThread>> {
  const parsed = createCommentThreadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "validation", message: "Invalid comment payload." };
  }

  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { ok: false, code: "unauthorized", message: error ?? "Unauthorized" };
  }

  const { data, error: insertError } = await supabase
    .from("comment_threads")
    .insert({
      document_id: parsed.data.documentId,
      body: parsed.data.body,
      selected_text_snapshot: parsed.data.selectedTextSnapshot,
      anchor_start: parsed.data.anchorStart,
      anchor_end: parsed.data.anchorEnd,
    })
    .select("*")
    .single();

  if (insertError || !data) {
    return {
      ok: false,
      code: "forbidden",
      message: "Unable to create comment. You may not have edit access.",
    };
  }

  revalidatePath(`/documents/${parsed.data.documentId}`);
  return { ok: true, data: mapThread(data as Record<string, unknown>) };
}

export async function createCommentReplyAction(
  input: unknown,
): Promise<CommentActionResult<CommentReply>> {
  const parsed = createCommentReplySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "validation", message: "Invalid reply payload." };
  }

  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { ok: false, code: "unauthorized", message: error ?? "Unauthorized" };
  }

  const { data, error: insertError } = await supabase
    .from("comment_replies")
    .insert({
      thread_id: parsed.data.threadId,
      body: parsed.data.body,
    })
    .select("*")
    .single();

  if (insertError || !data) {
    return {
      ok: false,
      code: "forbidden",
      message: "Unable to create reply.",
    };
  }

  return { ok: true, data: mapReply(data as Record<string, unknown>) };
}

export async function updateCommentThreadBodyAction(
  input: unknown,
): Promise<CommentActionResult<CommentThread>> {
  const parsed = updateCommentThreadBodySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "validation", message: "Invalid payload." };
  }

  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { ok: false, code: "unauthorized", message: error ?? "Unauthorized" };
  }

  const { data, error: updateError } = await supabase
    .from("comment_threads")
    .update({ body: parsed.data.body })
    .eq("id", parsed.data.threadId)
    .select("*")
    .maybeSingle();

  if (updateError || !data) {
    return { ok: false, code: "forbidden", message: "Unable to update comment." };
  }

  return { ok: true, data: mapThread(data as Record<string, unknown>) };
}

export async function setCommentResolvedAction(
  threadId: string,
  resolved: boolean,
): Promise<CommentActionResult<CommentThread>> {
  const parsed = threadIdSchema.safeParse({ threadId });
  if (!parsed.success) {
    return { ok: false, code: "validation", message: "Invalid thread id." };
  }

  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { ok: false, code: "unauthorized", message: error ?? "Unauthorized" };
  }

  const { data, error: updateError } = await supabase
    .from("comment_threads")
    .update({ resolved })
    .eq("id", parsed.data.threadId)
    .select("*")
    .maybeSingle();

  if (updateError || !data) {
    return {
      ok: false,
      code: "forbidden",
      message: "Unable to update resolution.",
    };
  }

  return { ok: true, data: mapThread(data as Record<string, unknown>) };
}

export async function markCommentOrphanedAction(
  input: unknown,
): Promise<CommentActionResult<CommentThread>> {
  const parsed = markCommentOrphanedSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "validation", message: "Invalid thread id." };
  }

  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { ok: false, code: "unauthorized", message: error ?? "Unauthorized" };
  }

  const { data, error: updateError } = await supabase
    .from("comment_threads")
    .update({ anchor_status: "orphaned" })
    .eq("id", parsed.data.threadId)
    .select("*")
    .maybeSingle();

  if (updateError || !data) {
    return {
      ok: false,
      code: "forbidden",
      message: "Unable to mark comment orphaned.",
    };
  }

  return { ok: true, data: mapThread(data as Record<string, unknown>) };
}

export async function deleteCommentThreadAction(
  threadId: string,
): Promise<CommentActionResult> {
  const parsed = threadIdSchema.safeParse({ threadId });
  if (!parsed.success) {
    return { ok: false, code: "validation", message: "Invalid thread id." };
  }

  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { ok: false, code: "unauthorized", message: error ?? "Unauthorized" };
  }

  const { error: deleteError } = await supabase
    .from("comment_threads")
    .delete()
    .eq("id", parsed.data.threadId);

  if (deleteError) {
    return { ok: false, code: "forbidden", message: "Unable to delete comment." };
  }

  return { ok: true, data: undefined };
}

export async function updateCommentReplyAction(
  input: unknown,
): Promise<CommentActionResult<CommentReply>> {
  const parsed = updateCommentReplySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "validation", message: "Invalid reply payload." };
  }

  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { ok: false, code: "unauthorized", message: error ?? "Unauthorized" };
  }

  const { data, error: updateError } = await supabase
    .from("comment_replies")
    .update({ body: parsed.data.body })
    .eq("id", parsed.data.replyId)
    .select("*")
    .maybeSingle();

  if (updateError || !data) {
    return { ok: false, code: "forbidden", message: "Unable to update reply." };
  }

  return { ok: true, data: mapReply(data as Record<string, unknown>) };
}

export async function deleteCommentReplyAction(
  replyId: string,
): Promise<CommentActionResult> {
  const parsed = uuidSchema.safeParse(replyId);
  if (!parsed.success) {
    return { ok: false, code: "validation", message: "Invalid reply id." };
  }

  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { ok: false, code: "unauthorized", message: error ?? "Unauthorized" };
  }

  const { error: deleteError } = await supabase
    .from("comment_replies")
    .delete()
    .eq("id", parsed.data);

  if (deleteError) {
    return { ok: false, code: "forbidden", message: "Unable to delete reply." };
  }

  return { ok: true, data: undefined };
}

export async function listSuggestionsAction(
  documentId: string,
): Promise<CommentActionResult<DocumentSuggestion[]>> {
  const parsed = uuidSchema.safeParse(documentId);
  if (!parsed.success) {
    return { ok: false, code: "validation", message: "Invalid document id." };
  }

  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { ok: false, code: "unauthorized", message: error ?? "Unauthorized" };
  }

  const { data, error: queryError } = await supabase
    .from("document_suggestions")
    .select("*")
    .eq("document_id", parsed.data)
    .order("created_at", { ascending: true });

  if (queryError) {
    return { ok: false, code: "query", message: "Failed to load suggestions." };
  }

  return {
    ok: true,
    data: (data ?? []).map((row) =>
      mapSuggestion(row as Record<string, unknown>),
    ),
  };
}

export async function createSuggestionAction(
  input: unknown,
): Promise<CommentActionResult<DocumentSuggestion>> {
  const parsed = createSuggestionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation",
      message: "Invalid suggestion payload.",
    };
  }

  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { ok: false, code: "unauthorized", message: error ?? "Unauthorized" };
  }

  const { data, error: insertError } = await supabase
    .from("document_suggestions")
    .insert({
      document_id: parsed.data.documentId,
      suggestion_type: parsed.data.suggestionType,
      original_text: parsed.data.originalText,
      proposed_content: parsed.data.proposedContent,
      anchor_start: parsed.data.anchorStart,
      anchor_end: parsed.data.anchorEnd,
    })
    .select("*")
    .single();

  if (insertError || !data) {
    return {
      ok: false,
      code: "forbidden",
      message: "Unable to create suggestion.",
    };
  }

  revalidatePath(`/documents/${parsed.data.documentId}`);
  return { ok: true, data: mapSuggestion(data as Record<string, unknown>) };
}

export async function claimSuggestionAcceptAction(
  suggestionId: string,
): Promise<CommentActionResult<DocumentSuggestion>> {
  const parsed = suggestionIdSchema.safeParse({ suggestionId });
  if (!parsed.success) {
    return { ok: false, code: "validation", message: "Invalid suggestion id." };
  }

  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { ok: false, code: "unauthorized", message: error ?? "Unauthorized" };
  }

  const { data, error: rpcError } = await supabase.rpc(
    "claim_document_suggestion_for_accept",
    { p_suggestion_id: parsed.data.suggestionId },
  );

  if (rpcError || !data) {
    return {
      ok: false,
      code: "conflict",
      message: rpcError?.message ?? "Unable to claim suggestion.",
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, data: mapSuggestion(row as Record<string, unknown>) };
}

export async function completeSuggestionAcceptAction(
  input: unknown,
): Promise<CommentActionResult<DocumentSuggestion>> {
  const parsed = completeSuggestionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "validation", message: "Invalid completion payload." };
  }

  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { ok: false, code: "unauthorized", message: error ?? "Unauthorized" };
  }

  const { data, error: rpcError } = await supabase.rpc(
    "complete_document_suggestion_accept",
    {
      p_suggestion_id: parsed.data.suggestionId,
      p_application_id: parsed.data.applicationId,
    },
  );

  if (rpcError || !data) {
    return {
      ok: false,
      code: "conflict",
      message: rpcError?.message ?? "Unable to complete suggestion.",
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, data: mapSuggestion(row as Record<string, unknown>) };
}

export async function failSuggestionAcceptAction(
  input: unknown,
): Promise<CommentActionResult<DocumentSuggestion>> {
  const parsed = failSuggestionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "validation", message: "Invalid fail payload." };
  }

  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { ok: false, code: "unauthorized", message: error ?? "Unauthorized" };
  }

  const { data, error: rpcError } = await supabase.rpc(
    "fail_document_suggestion_accept",
    {
      p_suggestion_id: parsed.data.suggestionId,
      p_application_id: parsed.data.applicationId,
      p_conflict_reason: parsed.data.conflictReason,
    },
  );

  if (rpcError || !data) {
    return {
      ok: false,
      code: "conflict",
      message: rpcError?.message ?? "Unable to mark suggestion conflict.",
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, data: mapSuggestion(row as Record<string, unknown>) };
}

export async function rejectSuggestionAction(
  suggestionId: string,
): Promise<CommentActionResult<DocumentSuggestion>> {
  const parsed = suggestionIdSchema.safeParse({ suggestionId });
  if (!parsed.success) {
    return { ok: false, code: "validation", message: "Invalid suggestion id." };
  }

  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { ok: false, code: "unauthorized", message: error ?? "Unauthorized" };
  }

  const { data, error: rpcError } = await supabase.rpc(
    "reject_document_suggestion",
    { p_suggestion_id: parsed.data.suggestionId },
  );

  if (rpcError || !data) {
    return {
      ok: false,
      code: "conflict",
      message: rpcError?.message ?? "Unable to reject suggestion.",
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, data: mapSuggestion(row as Record<string, unknown>) };
}

export async function releaseStaleSuggestionClaimAction(
  suggestionId: string,
): Promise<CommentActionResult<DocumentSuggestion>> {
  const parsed = suggestionIdSchema.safeParse({ suggestionId });
  if (!parsed.success) {
    return { ok: false, code: "validation", message: "Invalid suggestion id." };
  }

  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { ok: false, code: "unauthorized", message: error ?? "Unauthorized" };
  }

  const { data, error: rpcError } = await supabase.rpc(
    "release_stale_suggestion_claim",
    { p_suggestion_id: parsed.data.suggestionId },
  );

  if (rpcError || !data) {
    return {
      ok: false,
      code: "conflict",
      message: rpcError?.message ?? "Unable to release claim.",
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, data: mapSuggestion(row as Record<string, unknown>) };
}
