"use client";

import { LogOut, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { logoutAction } from "@/features/auth/actions";

type EditorUserMenuProps = {
  userName: string;
  userEmail: string;
};

export function EditorUserMenu({ userName, userEmail }: EditorUserMenuProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="hidden text-right sm:block">
        <p className="max-w-[10rem] truncate text-sm font-medium">{userName}</p>
        <p className="max-w-[10rem] truncate text-xs text-[var(--muted)]">
          {userEmail}
        </p>
      </div>
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]"
        aria-hidden
      >
        <User className="h-4 w-4 text-[var(--muted)]" />
      </div>
      <form action={logoutAction}>
        <Button type="submit" variant="secondary" size="sm">
          <LogOut className="h-4 w-4" />
          <span className="sr-only sm:not-sr-only">Sign out</span>
        </Button>
      </form>
    </div>
  );
}
