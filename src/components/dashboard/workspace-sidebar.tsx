"use client";

import {
  Clock3,
  FileText,
  Plus,
  Share2,
  LogOut,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { ImportDocumentButton } from "@/components/dashboard/import-document-button";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { logoutAction } from "@/features/auth/actions";
import { createDocumentAction } from "@/features/documents/actions";
import { cn } from "@/lib/utils/cn";
import { useState, useTransition } from "react";

type WorkspaceSidebarProps = {
  userEmail: string;
  userName: string;
};

const navItems = [
  { href: "/dashboard", label: "My Documents", icon: FileText },
  { href: "/dashboard?view=recent", label: "Recent", icon: Clock3 },
  { href: "/shared", label: "Shared with Me", icon: Share2 },
] as const;

export function WorkspaceSidebar({
  userEmail,
  userName,
}: WorkspaceSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    setCreateError(null);
    startTransition(async () => {
      const result = await createDocumentAction();
      if (result?.error) {
        setCreateError(result.error);
      }
    });
  }

  return (
    <aside className="flex h-full w-full flex-col border-r border-[var(--border)] bg-[var(--surface)] lg:w-64">
      <div className="px-5 py-5">
        <Link href="/dashboard" className="block">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--accent)]">
            Ajaia
          </p>
          <p className="mt-1 text-lg font-semibold tracking-tight">Workspace</p>
        </Link>
      </div>

      <div className="space-y-2 px-4">
        <Button
          type="button"
          className="w-full justify-start"
          onClick={handleCreate}
          disabled={isPending}
        >
          <Plus className="h-4 w-4" />
          {isPending ? "Creating…" : "New Document"}
        </Button>
        <ImportDocumentButton />
        {createError ? (
          <p className="text-xs text-[var(--danger)]" role="alert">
            {createError}
          </p>
        ) : null}
      </div>

      <nav className="mt-4 flex flex-1 flex-col gap-1 px-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/shared"
              ? pathname.startsWith("/shared")
              : item.href === "/dashboard?view=recent"
                ? pathname.startsWith("/dashboard") && view === "recent"
                : pathname.startsWith("/dashboard") && view !== "recent";

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-[var(--background)] font-medium text-[var(--foreground)]"
                  : "text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-4 pb-4">
        <Separator className="mb-4" />
        <div className="mb-3 px-1">
          <p className="truncate text-sm font-medium">{userName}</p>
          <p className="truncate text-xs text-[var(--muted)]">{userEmail}</p>
        </div>
        <form action={logoutAction}>
          <Button
            type="submit"
            variant="secondary"
            className="w-full justify-start"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  );
}
