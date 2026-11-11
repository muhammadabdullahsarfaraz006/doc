import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  ySyncPluginKey,
  type ProsemirrorMapping,
} from "@tiptap/y-tiptap";
import type { Editor } from "@tiptap/react";
import type * as Y from "yjs";

import {
  byteaToRelativePosition,
  relativePositionToBytea,
} from "@/lib/yjs/relative-position";

function getYState(editor: Editor): {
  type: Y.XmlFragment;
  mapping: ProsemirrorMapping;
} | null {
  const state = ySyncPluginKey.getState(editor.state) as
    | { type?: Y.XmlFragment; binding?: { mapping: ProsemirrorMapping } }
    | undefined;
  if (!state?.type || !state.binding?.mapping) {
    return null;
  }
  return { type: state.type, mapping: state.binding.mapping };
}

export function selectionToAnchorBytea(
  editor: Editor,
): { start: string; end: string; selectedText: string } | null {
  const yState = getYState(editor);
  if (!yState) {
    return null;
  }

  const { from, to } = editor.state.selection;
  if (from === to) {
    return null;
  }

  const startRel = absolutePositionToRelativePosition(
    from,
    yState.type,
    yState.mapping,
  );
  const endRel = absolutePositionToRelativePosition(
    to,
    yState.type,
    yState.mapping,
  );

  if (!startRel || !endRel) {
    return null;
  }

  return {
    start: relativePositionToBytea(startRel),
    end: relativePositionToBytea(endRel),
    selectedText: editor.state.doc.textBetween(from, to, "\n"),
  };
}

export function cursorToInsertionAnchorBytea(
  editor: Editor,
): { start: string; end: string } | null {
  const yState = getYState(editor);
  if (!yState) {
    return null;
  }

  const pos = editor.state.selection.from;
  const rel = absolutePositionToRelativePosition(
    pos,
    yState.type,
    yState.mapping,
  );
  if (!rel) {
    return null;
  }

  const encoded = relativePositionToBytea(rel);
  return { start: encoded, end: encoded };
}

export function resolveAnchorsToSelection(
  editor: Editor,
  startBytea: unknown,
  endBytea: unknown,
  ydoc: Y.Doc,
): { from: number; to: number } | null {
  const yState = getYState(editor);
  if (!yState) {
    return null;
  }

  const startRel = byteaToRelativePosition(startBytea);
  const endRel = byteaToRelativePosition(endBytea);
  if (!startRel || !endRel) {
    return null;
  }

  const from = relativePositionToAbsolutePosition(
    ydoc,
    yState.type,
    startRel,
    yState.mapping,
  );
  const to = relativePositionToAbsolutePosition(
    ydoc,
    yState.type,
    endRel,
    yState.mapping,
  );

  if (from == null || to == null) {
    return null;
  }

  return { from: Math.min(from, to), to: Math.max(from, to) };
}
