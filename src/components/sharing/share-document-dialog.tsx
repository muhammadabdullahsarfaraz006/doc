"use client";

import { Share2 } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listCollaboratorsAction,
  removeCollaboratorAction,
  shareDocumentAction,
  updateCollaboratorRoleAction,
} from "@/features/sharing/actions";
import type { Collaborator, DocumentRole } from "@/types/database";

type ShareDocumentDialogProps = {
  documentId: string;
  documentTitle: string;
};

export function ShareDocumentDialog({
  documentId,
  documentTitle,
}: ShareDocumentDialogProps) {
  const [open, setOpen] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<DocumentRole>("editor");
  const [loadingList, setLoadingList] = useState(false);
  const [isSharing, startShareTransition] = useTransition();
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<Collaborator | null>(
    null,
  );
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [isRemoving, startRemoveTransition] = useTransition();

  const loadCollaborators = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    const result = await listCollaboratorsAction(documentId);
    setLoadingList(false);

    if (!result.ok) {
      setListError(result.message);
      setCollaborators([]);
      return;
    }

    setCollaborators(result.data);
  }, [documentId]);

  useEffect(() => {
    if (open) {
      void loadCollaborators();
    }
  }, [open, loadCollaborators]);

  function handleShare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);

    startShareTransition(async () => {
      const result = await shareDocumentAction({
        documentId,
        email,
        role,
      });

      if (!result.ok) {
        setInviteError(result.message);
        return;
      }

      setInviteSuccess(`Shared with ${result.data.email} as ${result.data.role}.`);
      setEmail("");
      setRole("editor");
      setCollaborators((current) => [...current, result.data]);
    });
  }

  function handleRoleChange(memberId: string, nextRole: DocumentRole) {
    setPendingMemberId(memberId);
    setInviteError(null);

    startShareTransition(async () => {
      const result = await updateCollaboratorRoleAction({
        memberId,
        role: nextRole,
        documentId,
      });
      setPendingMemberId(null);

      if (!result.ok) {
        setInviteError(result.message);
        await loadCollaborators();
        return;
      }

      setCollaborators((current) =>
        current.map((item) =>
          item.member_id === memberId ? result.data : item,
        ),
      );
    });
  }

  function confirmRemove() {
    if (!memberToRemove) {
      return;
    }

    setRemoveError(null);
    startRemoveTransition(async () => {
      const result = await removeCollaboratorAction({
        memberId: memberToRemove.member_id,
        documentId,
      });

      if (!result.ok) {
        setRemoveError(result.message);
        return;
      }

      setCollaborators((current) =>
        current.filter((item) => item.member_id !== memberToRemove.member_id),
      );
      setMemberToRemove(null);
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="secondary" size="sm">
            <Share2 className="h-4 w-4" />
            Share
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Share document</DialogTitle>
            <DialogDescription>
              Invite a registered user to “{documentTitle}”. They must already
              have an Ajaia account.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleShare} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="share-email">Email</Label>
              <Input
                id="share-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="collaborator@example.com"
                required
                disabled={isSharing}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="share-role">Role</Label>
              <select
                id="share-role"
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as DocumentRole)
                }
                disabled={isSharing}
                className="flex h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            {inviteError ? (
              <p className="text-sm text-[var(--danger)]" role="alert">
                {inviteError}
              </p>
            ) : null}
            {inviteSuccess ? (
              <p className="text-sm text-emerald-700" role="status">
                {inviteSuccess}
              </p>
            ) : null}
            <Button type="submit" disabled={isSharing || !email.trim()}>
              {isSharing ? "Sharing…" : "Share"}
            </Button>
          </form>

          <div className="space-y-3 border-t border-[var(--border)] pt-4">
            <h3 className="text-sm font-medium">People with access</h3>
            {loadingList ? (
              <p className="text-sm text-[var(--muted)]">Loading collaborators…</p>
            ) : null}
            {listError ? (
              <p className="text-sm text-[var(--danger)]" role="alert">
                {listError}
              </p>
            ) : null}
            {!loadingList && !listError && collaborators.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                No collaborators yet.
              </p>
            ) : null}
            <ul className="space-y-3">
              {collaborators.map((collaborator) => (
                <li
                  key={collaborator.member_id}
                  className="flex flex-col gap-2 rounded-md border border-[var(--border)] p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {collaborator.full_name.trim() || collaborator.email}
                    </p>
                    <p className="truncate text-xs text-[var(--muted)]">
                      {collaborator.email}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`role-${collaborator.member_id}`}>
                      Role for {collaborator.email}
                    </label>
                    <select
                      id={`role-${collaborator.member_id}`}
                      value={collaborator.role}
                      disabled={
                        isSharing || pendingMemberId === collaborator.member_id
                      }
                      onChange={(event) =>
                        handleRoleChange(
                          collaborator.member_id,
                          event.target.value as DocumentRole,
                        )
                      }
                      className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs"
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={isSharing || isRemoving}
                      onClick={() => {
                        setRemoveError(null);
                        setMemberToRemove(collaborator);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={memberToRemove !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setMemberToRemove(null);
            setRemoveError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove access?</AlertDialogTitle>
            <AlertDialogDescription>
              {memberToRemove
                ? `${memberToRemove.email} will no longer be able to open this document.`
                : "This collaborator will lose access."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removeError ? (
            <p className="text-sm text-[var(--danger)]" role="alert">
              {removeError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="danger"
              disabled={isRemoving}
              onClick={confirmRemove}
            >
              {isRemoving ? "Removing…" : "Remove"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
