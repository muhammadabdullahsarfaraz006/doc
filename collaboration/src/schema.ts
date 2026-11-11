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

import { ParagraphLayout } from "./paragraph-layout.js";

/**
 * Must match the Next.js editor schema (src/features/editor/extensions.ts)
 * and Yjs field name. Collaboration uses the default TipTap fragment field.
 * TipTap v3 StarterKit already includes Underline — do not add it again.
 */
export const YJS_FIELD = "default" as const;

function isSafeLinkHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed) {
    return false;
  }
  try {
    const url = new URL(trimmed, "https://example.invalid");
    const protocol = url.protocol.toLowerCase();
    return (
      protocol === "http:" ||
      protocol === "https:" ||
      protocol === "mailto:"
    );
  } catch {
    return false;
  }
}

export const collabTiptapExtensions = [
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
    isAllowedUri: (url: string) => isSafeLinkHref(url),
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
