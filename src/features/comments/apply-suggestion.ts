import type { Editor } from "@tiptap/react";
import type * as Y from "yjs";

import type { DocumentSuggestion } from "@/features/comments/types";
import { resolveAnchorsToSelection } from "@/features/comments/editor-anchors";
import {
  getSuggestionApplicationMarker,
  setSuggestionApplicationMarker,
} from "@/lib/yjs/relative-position";

export type ApplySuggestionResult =
  | { ok: true; alreadyApplied: boolean }
  | { ok: false; reason: string };

/**
 * Apply a claimed suggestion to the live collaborative editor.
 * Marker + document mutation are performed back-to-back; marker is written
 * in a Yjs transaction immediately after the editor command succeeds.
 */
export function applyClaimedSuggestion(options: {
  editor: Editor;
  ydoc: Y.Doc;
  suggestion: DocumentSuggestion;
  applicationId: string;
}): ApplySuggestionResult {
  const { editor, ydoc, suggestion, applicationId } = options;

  const existingMarker = getSuggestionApplicationMarker(ydoc, suggestion.id);
  if (existingMarker === applicationId) {
    return { ok: true, alreadyApplied: true };
  }
  if (existingMarker && existingMarker !== applicationId) {
    return {
      ok: false,
      reason: "Suggestion was applied under a different application id.",
    };
  }

  const wasEditable = editor.isEditable;
  editor.setEditable(true);

  try {
    if (suggestion.suggestion_type === "insertion") {
      const range = resolveAnchorsToSelection(
        editor,
        suggestion.anchor_start,
        suggestion.anchor_end,
        ydoc,
      );
      if (!range) {
        return { ok: false, reason: "Insertion anchor could not be resolved." };
      }

      const text = suggestion.proposed_content.text ?? "";
      const ok = editor
        .chain()
        .focus()
        .setTextSelection(range.from)
        .insertContent(text)
        .run();
      if (!ok) {
        return { ok: false, reason: "Failed to insert suggested text." };
      }
    } else {
      const range = resolveAnchorsToSelection(
        editor,
        suggestion.anchor_start,
        suggestion.anchor_end,
        ydoc,
      );
      if (!range) {
        return { ok: false, reason: "Suggestion anchor could not be resolved." };
      }

      const current = editor.state.doc.textBetween(range.from, range.to, "\n");
      if (current !== suggestion.original_text) {
        return {
          ok: false,
          reason: "Target text no longer matches the original suggestion.",
        };
      }

      if (suggestion.suggestion_type === "deletion") {
        const ok = editor
          .chain()
          .focus()
          .setTextSelection({ from: range.from, to: range.to })
          .deleteSelection()
          .run();
        if (!ok) {
          return { ok: false, reason: "Failed to delete suggested text." };
        }
      } else {
        const replacement = suggestion.proposed_content.text ?? "";
        const ok = editor
          .chain()
          .focus()
          .setTextSelection({ from: range.from, to: range.to })
          .deleteSelection()
          .insertContent(replacement)
          .run();
        if (!ok) {
          return { ok: false, reason: "Failed to apply replacement." };
        }
      }
    }

    ydoc.transact(() => {
      setSuggestionApplicationMarker(ydoc, suggestion.id, applicationId);
    });
  } finally {
    editor.setEditable(wasEditable);
  }

  return { ok: true, alreadyApplied: false };
}
