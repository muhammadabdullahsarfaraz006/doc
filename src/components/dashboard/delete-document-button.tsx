"use client";

import { useActionState, useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  deleteDocumentAction,
  type DocumentActionState,
} from "@/features/documents/actions";

const initialState: DocumentActionState = {};

type DeleteDocumentButtonProps = {
  documentId: string;
  title: string;
};

export function DeleteDocumentButton({
  documentId,
  title,
}: DeleteDocumentButtonProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    deleteDocumentAction,
    initialState,
  );

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm">
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete document?</AlertDialogTitle>
          <AlertDialogDescription>
            “{title}” will be permanently deleted. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {state.error ? (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {state.error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <form action={formAction}>
            <input type="hidden" name="documentId" value={documentId} />
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
