"use client";

import type { PresenceUser } from "@/features/collaboration/types";
import { cn } from "@/lib/utils/cn";

type PresenceAvatarsProps = {
  users: PresenceUser[];
  activeCount: number;
  className?: string;
};

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
}

export function PresenceAvatars({
  users,
  activeCount,
  className,
}: PresenceAvatarsProps) {
  const visible = users.slice(0, 5);
  const overflow = Math.max(0, users.length - visible.length);

  return (
    <div
      className={cn("flex items-center gap-2", className)}
      aria-label={`${activeCount} active collaborator${activeCount === 1 ? "" : "s"}`}
    >
      <div className="flex -space-x-2">
        {visible.map((user) => (
          <span
            key={user.userId}
            title={`${user.name}${user.email ? ` (${user.email})` : ""}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--surface)] text-[10px] font-semibold text-white"
            style={{ backgroundColor: user.color }}
          >
            {initialsFor(user.name)}
          </span>
        ))}
        {overflow > 0 ? (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--surface)] bg-[var(--border)] text-[10px] font-semibold text-[var(--foreground)]">
            +{overflow}
          </span>
        ) : null}
      </div>
      <span className="text-xs text-[var(--muted)]">
        {activeCount} online
      </span>
    </div>
  );
}
