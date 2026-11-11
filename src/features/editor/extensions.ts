import type { AnyExtension } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import {
  Color,
  FontFamily,
  FontSize,
  TextStyle,
} from "@tiptap/extension-text-style";
import StarterKit from "@tiptap/starter-kit";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type * as Y from "yjs";

import { ParagraphLayout } from "@/features/editor/extensions/paragraph-layout";
import { isSafeLinkHref } from "@/features/editor/font-options";

export const YJS_FIELD = "default" as const;

export type CollaborationExtensionOptions = {
  ydoc: Y.Doc;
  provider: HocuspocusProvider;
  user: { name: string; color: string };
};

/**
 * Shared TipTap schema for collaborative and legacy editors.
 * Must stay in sync with collaboration/src/schema.ts.
 */
export function createBaseEditorExtensions(): AnyExtension[] {
  return [
    // TipTap v3 StarterKit already includes Underline and HorizontalRule.
    StarterKit.configure({
      undoRedo: false,
      heading: { levels: [1, 2, 3] },
      link: false,
    }),
    TextStyle,
    FontFamily,
    FontSize,
    Color,
    Highlight.configure({
      multicolor: true,
    }),
    Superscript,
    Subscript,
    TextAlign.configure({
      types: ["heading", "paragraph"],
      alignments: ["left", "center", "right", "justify"],
    }),
    ParagraphLayout,
    Link.configure({
      openOnClick: false,
      autolink: true,
      defaultProtocol: "https",
      protocols: ["http", "https", "mailto"],
      HTMLAttributes: {
        rel: "noopener noreferrer nofollow",
        target: "_blank",
        class: "ajaia-link",
      },
      isAllowedUri: (url) => isSafeLinkHref(url),
    }),
    TableKit.configure({
      table: {
        resizable: false,
        HTMLAttributes: {
          class: "ajaia-table",
        },
      },
    }),
  ];
}

export function createCollaborativeEditorExtensions(
  options: CollaborationExtensionOptions,
): AnyExtension[] {
  return [
    ...createBaseEditorExtensions(),
    Collaboration.configure({
      document: options.ydoc,
      field: YJS_FIELD,
    }),
    CollaborationCaret.configure({
      provider: options.provider,
      user: options.user,
    }),
  ];
}

export function createLegacyEditorExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: false,
    }),
    TextStyle,
    FontFamily,
    FontSize,
    Color,
    Highlight.configure({
      multicolor: true,
    }),
    Superscript,
    Subscript,
    TextAlign.configure({
      types: ["heading", "paragraph"],
      alignments: ["left", "center", "right", "justify"],
    }),
    ParagraphLayout,
    Link.configure({
      openOnClick: false,
      autolink: true,
      defaultProtocol: "https",
      protocols: ["http", "https", "mailto"],
      HTMLAttributes: {
        rel: "noopener noreferrer nofollow",
        target: "_blank",
        class: "ajaia-link",
      },
      isAllowedUri: (url) => isSafeLinkHref(url),
    }),
    TableKit.configure({
      table: {
        resizable: false,
        HTMLAttributes: {
          class: "ajaia-table",
        },
      },
    }),
  ];
}
