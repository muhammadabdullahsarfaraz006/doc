"use client";

import { Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { importDocumentAction } from "@/features/import/actions";

export function ImportDocumentButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [isPending, startTransition] = useTransition();

  function handlePick() {
    setError(null);
    setStatus("idle");
    inputRef.current?.click();
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setError(null);
    setStatus("loading");

    const formData = new FormData();
    formData.set("file", file);

    startTransition(async () => {
      const result = await importDocumentAction(formData);
      // redirect() throws; only failures return.
      if (result && !result.ok) {
        setStatus("idle");
        setError(result.error);
        return;
      }
      setStatus("success");
    });
  }

  const busy = isPending || status === "loading";

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md,.markdown,text/plain,text/markdown"
        className="sr-only"
        aria-label="Import text or Markdown file"
        onChange={handleChange}
      />
      <Button
        type="button"
        variant="secondary"
        className="w-full justify-start"
        onClick={handlePick}
        disabled={busy}
      >
        <Upload className="h-4 w-4" />
        {busy ? "Importing…" : "Import file"}
      </Button>
      {error ? (
        <p className="mt-2 text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
      {status === "success" ? (
        <p className="mt-2 text-xs text-[var(--muted)]" role="status">
          Import succeeded.
        </p>
      ) : null}
    </div>
  );
}
