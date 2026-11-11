"use client";

import type { Editor } from "@tiptap/react";
import { useState, useTransition } from "react";
import type * as Y from "yjs";

import { Button } from "@/components/ui/button";
import { applyClaimedSuggestion } from "@/features/comments/apply-suggestion";
import {
  claimSuggestionAcceptAction,
  completeSuggestionAcceptAction,
  createCommentReplyAction,
  createCommentThreadAction,
  createSuggestionAction,
  failSuggestionAcceptAction,
  markCommentOrphanedAction,
  rejectSuggestionAction,
  setCommentResolvedAction,
} from "@/features/comments/actions";
import {
  cursorToInsertionAnchorBytea,
  resolveAnchorsToSelection,
  selectionToAnchorBytea,
} from "@/features/comments/editor-anchors";
import type {
  CommentReply,
  CommentThread,
  DocumentSuggestion,
} from "@/features/comments/types";
import { getSuggestionApplicationMarker } from "@/lib/yjs/relative-position";

type CommentsPanelProps = {
  documentId: string;
  editor: Editor | null;
  ydoc: Y.Doc | null;
  canEdit: boolean;
  threads: CommentThread[];
  repliesByThread: Record<string, CommentReply[]>;
  suggestions: DocumentSuggestion[];
  loading: boolean;
  error: string | null;
  suggestionMode: boolean;
  onSuggestionModeChange: (value: boolean) => void;
  onReload: () => Promise<void>;
};

export function CommentsPanel({
  documentId,
  editor,
  ydoc,
  canEdit,
  threads,
  repliesByThread,
  suggestions,
  loading,
  error,
  suggestionMode,
  onSuggestionModeChange,
  onReload,
}: CommentsPanelProps) {
  const [pending, startTransition] = useTransition();
  const [commentDraft, setCommentDraft] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [suggestionText, setSuggestionText] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const visibleThreads = threads.filter(
    (thread) => showResolved || !thread.resolved,
  );
  const pendingSuggestions = suggestions.filter(
    (item) => item.status === "pending" || item.status === "applying",
  );
  const closedSuggestions = suggestions.filter(
    (item) =>
      item.status === "accepted" ||
      item.status === "rejected" ||
      item.status === "conflict",
  );

  function run(action: () => Promise<void>) {
    setActionError(null);
    startTransition(() => {
      void action().catch((err: unknown) => {
        setActionError(
          err instanceof Error ? err.message : "Something went wrong.",
        );
      });
    });
  }

  function handleAddComment() {
    if (!editor || !canEdit) {
      return;
    }
    const anchors = selectionToAnchorBytea(editor);
    if (!anchors) {
      setActionError("Select text in the document to comment on.");
      return;
    }
    const body = commentDraft.trim();
    if (!body) {
      setActionError("Comment cannot be empty.");
      return;
    }

    run(async () => {
      const result = await createCommentThreadAction({
        documentId,
        body,
        selectedTextSnapshot: anchors.selectedText,
        anchorStart: anchors.start,
        anchorEnd: anchors.end,
      });
      if (!result.ok) {
        setActionError(result.message);
        return;
      }
      setCommentDraft("");
      await onReload();
    });
  }

  function handleCreateSuggestion(type: "replacement" | "deletion" | "insertion") {
    if (!editor || !canEdit) {
      return;
    }

    run(async () => {
      if (type === "insertion") {
        const anchors = cursorToInsertionAnchorBytea(editor);
        const text = suggestionText.trim();
        if (!anchors) {
          setActionError("Place the cursor where text should be inserted.");
          return;
        }
        if (!text) {
          setActionError("Enter the text to insert.");
          return;
        }
        const result = await createSuggestionAction({
          documentId,
          suggestionType: "insertion",
          originalText: "",
          proposedContent: { text },
          anchorStart: anchors.start,
          anchorEnd: anchors.end,
        });
        if (!result.ok) {
          setActionError(result.message);
          return;
        }
        setSuggestionText("");
        await onReload();
        return;
      }

      const anchors = selectionToAnchorBytea(editor);
      if (!anchors) {
        setActionError("Select the text this suggestion applies to.");
        return;
      }

      if (type === "deletion") {
        const result = await createSuggestionAction({
          documentId,
          suggestionType: "deletion",
          originalText: anchors.selectedText,
          proposedContent: {},
          anchorStart: anchors.start,
          anchorEnd: anchors.end,
        });
        if (!result.ok) {
          setActionError(result.message);
          return;
        }
        await onReload();
        return;
      }

      const text = suggestionText.trim();
      if (!text) {
        setActionError("Enter replacement text.");
        return;
      }
      const result = await createSuggestionAction({
        documentId,
        suggestionType: "replacement",
        originalText: anchors.selectedText,
        proposedContent: { text },
        anchorStart: anchors.start,
        anchorEnd: anchors.end,
      });
      if (!result.ok) {
        setActionError(result.message);
        return;
      }
      setSuggestionText("");
      await onReload();
    });
  }

  function handleAccept(suggestion: DocumentSuggestion) {
    if (!editor || !ydoc || !canEdit) {
      return;
    }

    run(async () => {
      const claim = await claimSuggestionAcceptAction(suggestion.id);
      if (!claim.ok) {
        setActionError(claim.message);
        return;
      }

      const claimed = claim.data;
      const applicationId = claimed.application_id;
      if (!applicationId) {
        setActionError("Claim succeeded without an application id.");
        return;
      }

      const marker = getSuggestionApplicationMarker(ydoc, claimed.id);
      if (marker === applicationId) {
        const done = await completeSuggestionAcceptAction({
          suggestionId: claimed.id,
          applicationId,
        });
        if (!done.ok) {
          setActionError(done.message);
        }
        await onReload();
        return;
      }

      const applied = applyClaimedSuggestion({
        editor,
        ydoc,
        suggestion: claimed,
        applicationId,
      });

      if (!applied.ok) {
        await failSuggestionAcceptAction({
          suggestionId: claimed.id,
          applicationId,
          conflictReason: applied.reason,
        });
        setActionError(applied.reason);
        await onReload();
        return;
      }

      const done = await completeSuggestionAcceptAction({
        suggestionId: claimed.id,
        applicationId,
      });
      if (!done.ok) {
        setActionError(done.message);
      }
      await onReload();
    });
  }

  function handleReject(suggestionId: string) {
    run(async () => {
      const result = await rejectSuggestionAction(suggestionId);
      if (!result.ok) {
        setActionError(result.message);
        return;
      }
      await onReload();
    });
  }

  function handleJumpToThread(thread: CommentThread) {
    if (!editor || !ydoc) {
      return;
    }
    const range = resolveAnchorsToSelection(
      editor,
      thread.anchor_start,
      thread.anchor_end,
      ydoc,
    );
    if (!range) {
      if (thread.anchor_status === "active" && canEdit) {
        void markCommentOrphanedAction({ threadId: thread.id }).then(() =>
          onReload(),
        );
      }
      setActionError(
        thread.selected_text_snapshot
          ? `Anchor lost. Original text: “${thread.selected_text_snapshot.slice(0, 120)}”`
          : "Comment anchor could not be resolved.",
      );
      return;
    }
    editor.chain().focus().setTextSelection(range).scrollIntoView().run();
  }

  return (
    <aside
      className="flex h-full w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--surface)]"
      aria-label="Comments and suggestions"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">
          Comments
        </h2>
        {canEdit ? (
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <input
              type="checkbox"
              checked={suggestionMode}
              onChange={(event) =>
                onSuggestionModeChange(event.target.checked)
              }
              className="rounded border-[var(--border)]"
            />
            Suggesting
          </label>
        ) : null}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {error || actionError ? (
          <p className="text-xs text-[var(--danger)]" role="alert">
            {actionError ?? error}
          </p>
        ) : null}

        {canEdit && !suggestionMode ? (
          <div className="space-y-2">
            <label className="sr-only" htmlFor="new-comment">
              New comment
            </label>
            <textarea
              id="new-comment"
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              rows={3}
              placeholder="Select text, then write a comment…"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={handleAddComment}
            >
              Add comment
            </Button>
          </div>
        ) : null}

        {canEdit && suggestionMode ? (
          <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
            <p className="text-xs font-medium text-[var(--foreground)]">
              Suggestion mode
            </p>
            <textarea
              value={suggestionText}
              onChange={(event) => setSuggestionText(event.target.value)}
              rows={2}
              placeholder="Replacement / insertion text"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
              aria-label="Suggested text"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => handleCreateSuggestion("replacement")}
              >
                Replace
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => handleCreateSuggestion("deletion")}
              >
                Delete
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => handleCreateSuggestion("insertion")}
              >
                Insert
              </Button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-[var(--muted)]">Loading comments…</p>
        ) : null}

        <section className="space-y-3" aria-label="Pending suggestions">
          {pendingSuggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              canEdit={canEdit}
              pending={pending}
              onAccept={() => handleAccept(suggestion)}
              onReject={() => handleReject(suggestion.id)}
              onJump={() => {
                if (!editor || !ydoc) {
                  return;
                }
                const range = resolveAnchorsToSelection(
                  editor,
                  suggestion.anchor_start,
                  suggestion.anchor_end,
                  ydoc,
                );
                if (range) {
                  editor
                    .chain()
                    .focus()
                    .setTextSelection(range)
                    .scrollIntoView()
                    .run();
                }
              }}
            />
          ))}
        </section>

        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Threads
          </h3>
          <button
            type="button"
            className="text-xs text-[var(--accent)]"
            onClick={() => setShowResolved((value) => !value)}
          >
            {showResolved ? "Hide resolved" : "Show resolved"}
          </button>
        </div>

        {visibleThreads.length === 0 && !loading ? (
          <p className="text-sm text-[var(--muted)]">No comments yet.</p>
        ) : null}

        {visibleThreads.map((thread) => (
          <article
            key={thread.id}
            className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3"
          >
            <button
              type="button"
              className="text-left text-xs text-[var(--accent)]"
              onClick={() => handleJumpToThread(thread)}
            >
              {thread.anchor_status === "orphaned"
                ? "Orphaned anchor"
                : "Jump to text"}
            </button>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {thread.author_full_name || "Collaborator"}
              {thread.resolved ? " · Resolved" : ""}
            </p>
            {thread.selected_text_snapshot ? (
              <p className="mt-1 line-clamp-2 text-xs italic text-[var(--muted)]">
                “{thread.selected_text_snapshot}”
              </p>
            ) : null}
            <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--foreground)]">
              {thread.body}
            </p>

            <ul className="mt-2 space-y-2">
              {(repliesByThread[thread.id] ?? []).map((reply) => (
                <li
                  key={reply.id}
                  className="rounded border border-[var(--border)]/70 px-2 py-1.5 text-sm"
                >
                  <p className="text-xs text-[var(--muted)]">
                    {reply.author_full_name || "Collaborator"}
                  </p>
                  <p className="whitespace-pre-wrap">{reply.body}</p>
                </li>
              ))}
            </ul>

            {canEdit ? (
              <div className="mt-2 space-y-2">
                <textarea
                  value={replyDrafts[thread.id] ?? ""}
                  onChange={(event) =>
                    setReplyDrafts((prev) => ({
                      ...prev,
                      [thread.id]: event.target.value,
                    }))
                  }
                  rows={2}
                  placeholder="Reply…"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
                  aria-label={`Reply to comment by ${thread.author_full_name}`}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        const body = (replyDrafts[thread.id] ?? "").trim();
                        if (!body) {
                          setActionError("Reply cannot be empty.");
                          return;
                        }
                        const result = await createCommentReplyAction({
                          threadId: thread.id,
                          body,
                        });
                        if (!result.ok) {
                          setActionError(result.message);
                          return;
                        }
                        setReplyDrafts((prev) => ({
                          ...prev,
                          [thread.id]: "",
                        }));
                        await onReload();
                      })
                    }
                  >
                    Reply
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        const result = await setCommentResolvedAction(
                          thread.id,
                          !thread.resolved,
                        );
                        if (!result.ok) {
                          setActionError(result.message);
                          return;
                        }
                        await onReload();
                      })
                    }
                  >
                    {thread.resolved ? "Reopen" : "Resolve"}
                  </Button>
                </div>
              </div>
            ) : null}
          </article>
        ))}

        {closedSuggestions.length > 0 ? (
          <section className="space-y-2" aria-label="Closed suggestions">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Closed suggestions
            </h3>
            {closedSuggestions.map((suggestion) => (
              <p
                key={suggestion.id}
                className="text-xs text-[var(--muted)]"
              >
                {suggestion.suggestion_type} · {suggestion.status}
                {suggestion.conflict_reason
                  ? ` — ${suggestion.conflict_reason}`
                  : ""}
              </p>
            ))}
          </section>
        ) : null}
      </div>
    </aside>
  );
}

function SuggestionCard({
  suggestion,
  canEdit,
  pending,
  onAccept,
  onReject,
  onJump,
}: {
  suggestion: DocumentSuggestion;
  canEdit: boolean;
  pending: boolean;
  onAccept: () => void;
  onReject: () => void;
  onJump: () => void;
}) {
  return (
    <article className="rounded-md border border-amber-200 bg-amber-50/60 p-3">
      <button
        type="button"
        className="text-xs text-[var(--accent)]"
        onClick={onJump}
      >
        Jump to suggestion
      </button>
      <p className="mt-1 text-xs text-[var(--muted)]">
        {suggestion.author_full_name || "Collaborator"} ·{" "}
        {suggestion.suggestion_type} · {suggestion.status}
      </p>
      {suggestion.original_text ? (
        <p className="mt-1 text-xs line-through text-[var(--muted)]">
          {suggestion.original_text}
        </p>
      ) : null}
      {suggestion.proposed_content.text ? (
        <p className="mt-1 text-sm text-[var(--foreground)]">
          {suggestion.proposed_content.text}
        </p>
      ) : null}
      {canEdit && suggestion.status !== "applying" ? (
        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={onAccept}
          >
            Accept
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={onReject}
          >
            Reject
          </Button>
        </div>
      ) : null}
      {suggestion.status === "applying" ? (
        <p className="mt-2 text-xs text-[var(--muted)]">Applying…</p>
      ) : null}
    </article>
  );
}
