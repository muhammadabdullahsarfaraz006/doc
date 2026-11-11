"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { DeleteDocumentButton } from "@/components/dashboard/delete-document-button";
import { CollaborativeDocumentEditor } from "@/components/editor/collaborative-document-editor";
import { DocumentTitleInput } from "@/components/editor/document-title-input";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import { EditorUserMenu } from "@/components/editor/editor-user-menu";
import { ImportIntoDocumentButton } from "@/components/editor/import-into-document-button";
import { SaveStatusIndicator } from "@/components/editor/save-status";
import { ShareDocumentDialog } from "@/components/sharing/share-document-dialog";
import { isCollaborationEnabled } from "@/features/collaboration/env";
import { useDocumentAutosave } from "@/features/documents/use-document-autosave";
import { createLegacyEditorExtensions } from "@/features/editor/extensions";
import {
  normalizeTipTapDocument,
  type TipTapDocument,
} from "@/lib/validation/tiptap";
import type { DocumentAccessRole } from "@/types/database";

type DocumentEditorProps = {
  documentId: string;
  initialTitle: string;
  initialRevision: number;
  initialContent: TipTapDocument;
  role: DocumentAccessRole;
  canEdit: boolean;
  canRename: boolean;
  canDelete: boolean;
  canShare: boolean;
  userId: string;
  userName: string;
  userEmail: string;
};

export function DocumentEditor(props: DocumentEditorProps) {
  if (isCollaborationEnabled()) {
    return (
      <CollaborativeDocumentEditor
        documentId={props.documentId}
        initialTitle={props.initialTitle}
        initialRevision={props.initialRevision}
        role={props.role}
        canEdit={props.canEdit}
        canRename={props.canRename}
        canDelete={props.canDelete}
        canShare={props.canShare}
        userId={props.userId}
        userName={props.userName}
        userEmail={props.userEmail}
      />
    );
  }

  return <LegacyDocumentEditor {...props} />;
}

function LegacyDocumentEditor({
  documentId,
  initialTitle,
  initialRevision,
  initialContent,
  role,
  canEdit,
  canRename,
  canDelete,
  canShare,
  userName,
  userEmail,
}: DocumentEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const normalizedContent = normalizeTipTapDocument(initialContent);

  const {
    status,
    errorMessage,
    revision,
    queueSave,
    retry,
    flushNow,
    syncRevisionFromRename,
  } = useDocumentAutosave({
    documentId,
    initialRevision,
    initialContent: normalizedContent,
    canEdit,
  });

  const editor = useEditor({
    extensions: createLegacyEditorExtensions(),
    content: normalizedContent,
    editable: canEdit,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "ajaia-editor prose prose-neutral max-w-none min-h-[70vh] focus:outline-none",
        "aria-label": "Document content",
      },
    },
    onUpdate: ({ editor: current }) => {
      if (!canEdit) {
        return;
      }
      queueSave(normalizeTipTapDocument(current.getJSON()));
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }
    editor.setEditable(canEdit);
  }, [canEdit, editor]);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "hidden") {
        flushNow();
      }
    }

    window.addEventListener("beforeunload", flushNow);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("beforeunload", flushNow);
      document.removeEventListener("visibilitychange", handleVisibility);
      flushNow();
    };
  }, [flushNow]);

  const roleLabel =
    role === "owner" ? "Owner" : role === "editor" ? "Editor" : "Viewer";

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
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
                syncRevisionFromRename(nextRevision);
              }}
            />
            <div className="mt-1 flex flex-wrap items-center gap-3 px-1">
              {canEdit ? (
                <SaveStatusIndicator
                  status={status}
                  errorMessage={errorMessage}
                  onRetry={
                    status === "error" || status === "conflict"
                      ? retry
                      : undefined
                  }
                />
              ) : (
                <span className="text-xs text-[var(--muted)]">View only</span>
              )}
              <span className="text-xs text-[var(--muted)]">{roleLabel}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canEdit ? (
              <ImportIntoDocumentButton editor={editor} disabled={!canEdit} />
            ) : null}
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
        <div className="mx-auto w-full max-w-5xl px-2 sm:px-4">
          <EditorToolbar editor={editor} disabled={!canEdit} />
        </div>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6">
        <div className="mx-auto w-full max-w-3xl rounded-lg border border-[var(--border)] bg-[var(--surface)] px-6 py-8 shadow-sm sm:px-10 sm:py-12">
          <EditorContent editor={editor} />
        </div>
      </main>
    </div>
  );
}
