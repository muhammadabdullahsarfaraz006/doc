"use client";

import type { Editor } from "@tiptap/react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  isSafeLinkHref,
  normalizeLinkHref,
} from "@/features/editor/font-options";

type LinkDialogProps = {
  editor: Editor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function LinkDialog({ editor, open, onOpenChange }: LinkDialogProps) {
  const [href, setHref] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const current = editor.getAttributes("link").href;
    setHref(typeof current === "string" ? current : "");
    setError(null);
  }, [editor, open]);

  function handleSave() {
    const normalized = normalizeLinkHref(href);
    if (!isSafeLinkHref(normalized)) {
      setError("Enter a valid http(s) or mailto link.");
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: normalized })
      .run();
    onOpenChange(false);
  }

  function handleRemove() {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link</DialogTitle>
          <DialogDescription>
            Insert or edit a hyperlink. Only http, https, and mailto are
            allowed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="link-href">URL</Label>
          <Input
            id="link-href"
            value={href}
            onChange={(event) => setHref(event.target.value)}
            placeholder="https://example.com"
            autoFocus
          />
          {error ? (
            <p className="text-xs text-[var(--danger)]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          {editor.isActive("link") ? (
            <Button type="button" variant="danger" onClick={handleRemove}>
              Remove
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
