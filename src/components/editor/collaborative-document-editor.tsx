"use client";

import type { HocuspocusProvider } from "@hocuspocus/provider";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type * as Y from "yjs";

import { DeleteDocumentButton } from "@/components/dashboard/delete-document-button";
import { CommentsPanel } from "@/components/editor/comments-panel";
import { ConnectionStatusIndicator } from "@/components/editor/connection-status";
import { DocumentTitleInput } from "@/components/editor/document-title-input";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import { EditorUserMenu } from "@/components/editor/editor-user-menu";
import { ImportIntoDocumentButton } from "@/components/editor/import-into-document-button";
import { PresenceAvatars } from "@/components/editor/presence-avatars";
import { ShareDocumentDialog } from "@/components/sharing/share-document-dialog";
import { colorForUserId } from "@/features/collaboration/types";
import { useCollaboration } from "@/features/collaboration/use-collaboration";
import { useDocumentComments } from "@/features/comments/use-document-comments";
import { createCollaborativeEditorExtensions } from "@/features/editor/extensions";
import type { DocumentAccessRole } from "@/types/database";

type CollaborativeDocumentEditorProps = {
  documentId: string;
  initialTitle: string;
  initialRevision: number;
  role: DocumentAccessRole;
  canEdit: boolean;
  canRename: boolean;
  canDelete: boolean;
  canShare: boolean;
  userId: string;
  userName: string;
  userEmail: string;
};

export function CollaborativeDocumentEditor({
  documentId,
  initialTitle,
  initialRevision,
  role,
  canEdit,
  canRename,
  canDelete,
  canShare,
  userId,
  userName,
  userEmail,
}: CollaborativeDocumentEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [revision, setRevision] = useState(initialRevision);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [suggestionMode, setSuggestionMode] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  const {
    ydoc,
    provider,
    status,
    synced,
    errorMessage,
    presenceUsers,
    activeCount,
  } = useCollaboration({
    documentId,
    userId,
    userName,
    userEmail,
    enabled: true,
  });

  const {
    threads,
    repliesByThread,
    suggestions,
    loading: commentsLoading,
    error: commentsError,
    reload: reloadComments,
  } = useDocumentComments(documentId, true);

  const handleEditorChange = useCallback((next: Editor | null) => {
    setEditor(next);
  }, []);

  const roleLabel =
    role === "owner" ? "Owner" : role === "editor" ? "Editor" : "Viewer";

  // TipTap must mount only after the first Yjs sync, otherwise each browser
  // initializes an empty local fragment and live edits do not converge cleanly.
  const editorReady = Boolean(ydoc && provider && synced);
  const toolbarEditable = canEdit && editorReady && !suggestionMode;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-[var(--accent)]"
          >
            ← Workspace
          </Link>
          <div className="min-w-0 flex-1">
            <DocumentTitleInput
              documentId={documentId}
              title={title}
              revision={revision}
              canRename={canRename}
              onRenamed={(nextTitle, nextRevision) => {
                setTitle(nextTitle);
                setRevision(nextRevision);
              }}
            />
            <div className="mt-1 flex flex-wrap items-center gap-3 px-1">
              <ConnectionStatusIndicator
                status={status}
                errorMessage={errorMessage}
              />
              {!synced && status === "connected" ? (
                <span className="text-xs text-[var(--muted)]">Syncing…</span>
              ) : null}
              {!canEdit ? (
                <span className="text-xs text-[var(--muted)]">View only</span>
              ) : null}
              {suggestionMode ? (
                <span className="text-xs text-amber-700">Suggesting</span>
              ) : null}
              <span className="text-xs text-[var(--muted)]">{roleLabel}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PresenceAvatars users={presenceUsers} activeCount={activeCount} />
            {canEdit ? (
              <ImportIntoDocumentButton
                editor={editor}
                disabled={!editorReady || suggestionMode}
              />
            ) : null}
            <button
              type="button"
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--background)]"
              onClick={() => setPanelOpen((value) => !value)}
              aria-pressed={panelOpen}
            >
              {panelOpen ? "Hide comments" : "Show comments"}
            </button>
            {canShare ? (
              <ShareDocumentDialog
                documentId={documentId}
                documentTitle={title}
              />
            ) : null}
            {canDelete ? (
              <DeleteDocumentButton documentId={documentId} title={title} />
            ) : null}
            <EditorUserMenu userName={userName} userEmail={userEmail} />
          </div>
        </div>
        <div className="mx-auto w-full max-w-7xl px-2 sm:px-4">
          <EditorToolbar
            editor={editor}
            disabled={!toolbarEditable}
          />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col lg:flex-row">
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">
          {status === "error" ? (
            <div
              className="mb-4 rounded-lg border border-[var(--danger)]/30 bg-red-50 px-4 py-3 text-sm text-[var(--danger)]"
              role="alert"
            >
              {errorMessage ||
                "The collaboration server is unavailable. Document edits cannot sync until it is reachable."}
            </div>
          ) : null}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-6 py-8 shadow-sm sm:px-10 sm:py-12">
            {editorReady ? (
              <CollaborativeEditorInstance
                ydoc={ydoc!}
                provider={provider!}
                canEdit={canEdit && !suggestionMode}
                userId={userId}
                userName={userName}
                onEditorChange={handleEditorChange}
              />
            ) : (
              <p className="text-sm text-[var(--muted)]">
                {status === "error"
                  ? "Collaboration unavailable."
                  : "Syncing document…"}
              </p>
            )}
          </div>
        </main>
        {panelOpen ? (
          <div className="w-full shrink-0 border-t border-[var(--border)] lg:w-[22rem] lg:border-t-0">
            <CommentsPanel
              documentId={documentId}
              editor={editor}
              ydoc={ydoc}
              canEdit={canEdit}
              threads={threads}
              repliesByThread={repliesByThread}
              suggestions={suggestions}
              loading={commentsLoading}
              error={commentsError}
              suggestionMode={suggestionMode}
              onSuggestionModeChange={setSuggestionMode}
              onReload={reloadComments}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

type InstanceProps = {
  ydoc: Y.Doc;
  provider: HocuspocusProvider;
  canEdit: boolean;
  userId: string;
  userName: string;
  onEditorChange: (editor: Editor | null) => void;
};

function CollaborativeEditorInstance({
  ydoc,
  provider,
  canEdit,
  userId,
  userName,
  onEditorChange,
}: InstanceProps) {
  const editor = useEditor({
    extensions: createCollaborativeEditorExtensions({
      ydoc,
      provider,
      user: {
        name: userName,
        color: colorForUserId(userId),
      },
    }),
    editable: canEdit,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class:
          "ajaia-editor prose prose-neutral max-w-none min-h-[70vh] focus:outline-none",
        "aria-label": "Document content",
      },
    },
  });

  useEffect(() => {
    onEditorChange(editor);
    return () => onEditorChange(null);
  }, [editor, onEditorChange]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    editor.setEditable(canEdit);
  }, [canEdit, editor]);

  if (!editor) {
    return <p className="text-sm text-[var(--muted)]">Loading editor…</p>;
  }

  return <EditorContent editor={editor} />;
}
