"use client";

import type { Editor } from "@tiptap/react";
import { useState } from "react";

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

type TableDialogProps = {
  editor: Editor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function TableDialog({ editor, open, onOpenChange }: TableDialogProps) {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);

  function handleInsert() {
    const safeRows = Math.min(10, Math.max(1, Math.round(rows)));
    const safeCols = Math.min(10, Math.max(1, Math.round(cols)));
    editor
      .chain()
      .focus()
      .insertTable({ rows: safeRows, cols: safeCols, withHeaderRow: true })
      .run();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Insert table</DialogTitle>
          <DialogDescription>
            Choose rows and columns (1–10). Header row included.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="table-rows">Rows</Label>
            <Input
              id="table-rows"
              type="number"
              min={1}
              max={10}
              value={rows}
              onChange={(event) => setRows(Number(event.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="table-cols">Columns</Label>
            <Input
              id="table-cols"
              type="number"
              min={1}
              max={10}
              value={cols}
              onChange={(event) => setCols(Number(event.target.value))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleInsert}>
            Insert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
