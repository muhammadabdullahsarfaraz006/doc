"use client";

import { AlertCircle, Check, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SaveStatus } from "@/features/documents/use-document-autosave";
import { cn } from "@/lib/utils/cn";

type SaveStatusIndicatorProps = {
  status: SaveStatus;
  errorMessage: string | null;
  onRetry?: () => void;
  className?: string;
};

export function SaveStatusIndicator({
  status,
  errorMessage,
  onRetry,
  className,
}: SaveStatusIndicatorProps) {
  if (status === "idle") {
    return (
      <span className={cn("text-xs text-[var(--muted)]", className)}>
        Ready
      </span>
    );
  }

  if (status === "dirty") {
    return (
      <span className={cn("text-xs text-[var(--muted)]", className)}>
        Unsaved changes
      </span>
    );
  }

  if (status === "saving") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-[var(--muted)]",
          className,
        )}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Saving…
      </span>
    );
  }

  if (status === "saved") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-emerald-700",
          className,
        )}
      >
        <Check className="h-3.5 w-3.5" aria-hidden />
        Saved
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex max-w-md flex-wrap items-center gap-2 text-xs text-[var(--danger)]",
        className,
      )}
      role="alert"
    >
      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        {status === "conflict"
          ? errorMessage || "Save conflict"
          : errorMessage || "Save failed"}
      </span>
      {onRetry ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 px-2"
          onClick={onRetry}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      ) : null}
    </span>
  );
}
