"use client";

import type { Editor } from "@tiptap/react";
import { Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { parseImportFileAction } from "@/features/import/actions";

type ImportIntoDocumentButtonProps = {
  editor: Editor | null;
  disabled?: boolean;
};

/**
 * Replaces the current editor content with an imported .txt/.md file.
 * In collaborative mode this flows through TipTap → Yjs automatically.
 */
export function ImportIntoDocumentButton({
  editor,
  disabled = false,
}: ImportIntoDocumentButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !editor) {
      return;
    }

    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.set("file", file);

    startTransition(async () => {
      const result = await parseImportFileAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      try {
        editor.commands.setContent(result.content);
        setMessage(`Imported “${result.title}”.`);
      } catch {
        setError("Could not apply imported content to the editor.");
      }
    });
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md,.markdown,text/plain,text/markdown"
        className="sr-only"
        aria-label="Import file into this document"
        onChange={handleChange}
      />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={disabled || !editor || isPending}
        onClick={() => inputRef.current?.click()}
        title="Import .txt or .md into this document"
      >
        <Upload className="h-3.5 w-3.5" />
        {isPending ? "Importing…" : "Import"}
      </Button>
      {error ? (
        <p
          className="absolute right-0 top-9 z-30 w-56 rounded-md border border-[var(--danger)]/30 bg-red-50 px-2 py-1 text-xs text-[var(--danger)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {message ? (
        <p
          className="absolute right-0 top-9 z-30 w-56 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--muted)]"
          role="status"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
