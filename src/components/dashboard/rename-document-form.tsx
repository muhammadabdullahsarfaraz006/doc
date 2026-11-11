"use client";

import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  renameDocumentAction,
  type DocumentActionState,
} from "@/features/documents/actions";

const initialState: DocumentActionState = {};

type RenameDocumentFormProps = {
  documentId: string;
  title: string;
  revision: number;
};

export function RenameDocumentForm({
  documentId,
  title,
  revision,
}: RenameDocumentFormProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    renameDocumentAction,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      setOpen(false);
    }
  }, [state.success]);

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Rename
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="revision" value={revision} />
      <Input
        name="title"
        defaultValue={title}
        aria-label="Document title"
        className="h-8 w-44"
        required
        maxLength={200}
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setOpen(false)}
        disabled={pending}
      >
        Cancel
      </Button>
      {state.error ? (
        <p className="w-full text-xs text-[var(--danger)]" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
