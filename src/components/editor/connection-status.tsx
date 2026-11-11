"use client";

import { AlertCircle, Loader2, Radio, WifiOff } from "lucide-react";

import type { CollaborationConnectionStatus } from "@/features/collaboration/types";
import { cn } from "@/lib/utils/cn";

type ConnectionStatusIndicatorProps = {
  status: CollaborationConnectionStatus;
  errorMessage: string | null;
  className?: string;
};

export function ConnectionStatusIndicator({
  status,
  errorMessage,
  className,
}: ConnectionStatusIndicatorProps) {
  if (status === "connected") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-emerald-700",
          className,
        )}
      >
        <Radio className="h-3.5 w-3.5" aria-hidden />
        Connected
      </span>
    );
  }

  if (status === "connecting") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-[var(--muted)]",
          className,
        )}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Connecting…
      </span>
    );
  }

  if (status === "reconnecting") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-amber-700",
          className,
        )}
        title="Connection closed (including platform duration limits). Syncing resumes after reconnect."
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Reconnecting…
      </span>
    );
  }

  if (status === "disconnected") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-[var(--muted)]",
          className,
        )}
      >
        <WifiOff className="h-3.5 w-3.5" aria-hidden />
        Disconnected
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex max-w-md items-center gap-1.5 text-xs text-[var(--danger)]",
        className,
      )}
      role="alert"
    >
      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {errorMessage || "Collaboration unavailable"}
    </span>
  );
}
