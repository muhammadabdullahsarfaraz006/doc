"use client";

import { useEffect, useState, useTransition } from "react";

import { renameDocument } from "@/features/documents/actions";
import { documentTitleSchema } from "@/lib/validation/documents";
import { cn } from "@/lib/utils/cn";

type DocumentTitleInputProps = {
  documentId: string;
  title: string;
  revision: number;
  canRename: boolean;
  onRenamed: (title: string, revision: number) => void;
};

export function DocumentTitleInput({
  documentId,
  title,
  revision,
  canRename,
  onRenamed,
}: DocumentTitleInputProps) {
  const [value, setValue] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setValue(title);
  }, [title]);

  if (!canRename) {
    return (
      <h1 className="truncate text-lg font-semibold tracking-tight text-[var(--foreground)]">
        {title}
      </h1>
    );
  }

  function commitTitle() {
    const parsed = documentTitleSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid title");
      setValue(title);
      return;
    }

    if (parsed.data === title) {
      setValue(parsed.data);
      setError(null);
      return;
    }

    startTransition(async () => {
      const result = await renameDocument({
        documentId,
        title: parsed.data,
        expectedRevision: revision,
      });

      if (!result.ok) {
        setError(result.message);
        setValue(title);
        return;
      }

      setError(null);
      setValue(result.title);
      onRenamed(result.title, result.revision);
    });
  }

  return (
    <div className="min-w-0 flex-1">
      <label className="sr-only" htmlFor="document-title">
        Document title
      </label>
      <input
        id="document-title"
        value={value}
        disabled={isPending}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
        onBlur={commitTitle}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            setValue(title);
            setError(null);
            event.currentTarget.blur();
          }
        }}
        className={cn(
          "w-full truncate rounded-md border border-transparent bg-transparent px-1 py-0.5 text-lg font-semibold tracking-tight text-[var(--foreground)] outline-none focus:border-[var(--border)] focus:bg-[var(--surface)]",
          isPending && "opacity-70",
        )}
      />
      {error ? (
        <p className="mt-1 text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
