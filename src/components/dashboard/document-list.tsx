import Link from "next/link";

import { DeleteDocumentButton } from "@/components/dashboard/delete-document-button";
import { RenameDocumentForm } from "@/components/dashboard/rename-document-form";
import type { Document } from "@/types/database";

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

type DocumentListProps = {
  documents: Document[];
  emptyMessage: string;
};

export function DocumentList({ documents, emptyMessage }: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center">
        <h2 className="text-base font-medium">No documents yet</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      {documents.map((document) => (
        <li
          key={document.id}
          className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 flex-1">
            <Link
              href={`/documents/${document.id}`}
              className="block truncate text-sm font-medium text-[var(--foreground)] hover:text-[var(--accent)]"
            >
              {document.title}
            </Link>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Updated {formatUpdatedAt(document.updated_at)} · Owned by you
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RenameDocumentForm
              documentId={document.id}
              title={document.title}
              revision={document.revision}
            />
            <DeleteDocumentButton
              documentId={document.id}
              title={document.title}
            />
            <Link
              href={`/documents/${document.id}`}
              className="inline-flex h-8 items-center rounded-md border border-[var(--border)] px-3 text-xs font-medium hover:bg-[var(--background)]"
            >
              Open
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
