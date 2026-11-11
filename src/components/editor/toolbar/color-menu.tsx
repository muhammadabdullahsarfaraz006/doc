"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

type ColorOption = { label: string; value: string | null };

type ColorMenuProps = {
  label: string;
  colors: readonly ColorOption[];
  current: string | null;
  disabled?: boolean;
  onSelect: (value: string | null) => void;
  swatchClassName?: string;
  recentKey: string;
};

function loadRecent(key: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string").slice(0, 6);
  } catch {
    return [];
  }
}

function saveRecent(key: string, color: string) {
  if (typeof window === "undefined") {
    return;
  }
  const next = [color, ...loadRecent(key).filter((item) => item !== color)].slice(
    0,
    6,
  );
  window.localStorage.setItem(key, JSON.stringify(next));
}

export function ColorMenu({
  label,
  colors,
  current,
  disabled,
  onSelect,
  swatchClassName,
  recentKey,
}: ColorMenuProps) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("#2563eb");
  const [recent, setRecent] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecent(loadRecent(recentKey));
  }, [recentKey, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        title={label}
        aria-label={label}
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
        className="h-8 w-8"
      >
        <span
          className={cn(
            "block h-4 w-4 rounded-sm border border-[var(--border)]",
            swatchClassName,
          )}
          style={{
            backgroundColor: current ?? "transparent",
            backgroundImage:
              current == null
                ? "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%)"
                : undefined,
            backgroundSize: current == null ? "6px 6px" : undefined,
          }}
        />
      </Button>
      {open ? (
        <div className="absolute left-0 top-9 z-40 w-56 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg">
          <div className="mb-2 grid grid-cols-6 gap-1">
            {colors.map((color) => (
              <button
                key={color.label}
                type="button"
                title={color.label}
                aria-label={color.label}
                className="h-6 w-6 rounded-sm border border-[var(--border)]"
                style={{
                  backgroundColor: color.value ?? "#ffffff",
                }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(color.value);
                  if (color.value) {
                    saveRecent(recentKey, color.value);
                    setRecent(loadRecent(recentKey));
                  }
                  setOpen(false);
                }}
              />
            ))}
          </div>
          {recent.length > 0 ? (
            <div className="mb-2">
              <p className="mb-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                Recent
              </p>
              <div className="flex flex-wrap gap-1">
                {recent.map((color) => (
                  <button
                    key={color}
                    type="button"
                    title={color}
                    className="h-6 w-6 rounded-sm border border-[var(--border)]"
                    style={{ backgroundColor: color }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onSelect(color);
                      saveRecent(recentKey, color);
                      setOpen(false);
                    }}
                  />
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={custom}
              aria-label={`${label} custom`}
              onMouseDown={(event) => event.preventDefault()}
              onChange={(event) => setCustom(event.target.value)}
              className="h-8 w-10 cursor-pointer rounded border border-[var(--border)] bg-transparent"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(custom);
                saveRecent(recentKey, custom);
                setRecent(loadRecent(recentKey));
                setOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
