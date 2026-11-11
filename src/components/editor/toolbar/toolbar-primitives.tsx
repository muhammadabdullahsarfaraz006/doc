"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
  className,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "h-8 w-8 shrink-0",
        active && "bg-[var(--background)] text-[var(--accent)]",
        className,
      )}
    >
      {children}
    </Button>
  );
}

export function ToolbarSelect({
  label,
  value,
  disabled,
  onChange,
  children,
  className,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className="sr-only-focusable flex items-center">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        title={label}
        value={value}
        disabled={disabled}
        onMouseDown={(event) => event.stopPropagation()}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-8 max-w-[9.5rem] shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--foreground)] disabled:opacity-50",
          className,
        )}
      >
        {children}
      </select>
    </label>
  );
}

export function ToolbarGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-0.5"
      role="group"
      aria-label={label}
    >
      {children}
    </div>
  );
}
