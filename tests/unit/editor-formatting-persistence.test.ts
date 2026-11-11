import { Editor, getSchema } from "@tiptap/core";
import {
  prosemirrorJSONToYDoc,
  yDocToProsemirrorJSON,
} from "@tiptap/y-tiptap";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

import { createLegacyEditorExtensions, YJS_FIELD } from "@/features/editor/extensions";

describe("formatting persistence across JSON/Yjs round-trip", () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
  });

  it("preserves mixed marks and paragraph attrs through Yjs transform", () => {
    const extensions = createLegacyEditorExtensions();
    editor = new Editor({
      extensions,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: {
              textAlign: "right",
              indent: 2,
              firstLineIndent: 24,
              lineHeight: "1.15",
              spaceBefore: 4,
              spaceAfter: 12,
            },
            content: [
              {
                type: "text",
                text: "Styled",
                marks: [
                  {
                    type: "textStyle",
                    attrs: {
                      fontFamily: "Georgia, serif",
                      fontSize: "20px",
                      color: "#dc2626",
                    },
                  },
                  {
                    type: "highlight",
                    attrs: { color: "#fef08a" },
                  },
                  { type: "bold" },
                ],
              },
            ],
          },
        ],
      },
    });

    const json = editor.getJSON();
    const schema = getSchema(extensions);
    const ydoc = prosemirrorJSONToYDoc(schema, json, YJS_FIELD);
    const restored = yDocToProsemirrorJSON(ydoc, YJS_FIELD) as {
      content?: Array<{
        attrs?: Record<string, unknown>;
        content?: Array<{
          marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
        }>;
      }>;
    };

    const paragraph = restored.content?.[0];
    expect(paragraph?.attrs?.textAlign).toBe("right");
    expect(paragraph?.attrs?.indent).toBe(2);
    expect(paragraph?.attrs?.firstLineIndent).toBe(24);
    expect(paragraph?.attrs?.lineHeight).toBe("1.15");
    expect(paragraph?.attrs?.spaceBefore).toBe(4);
    expect(paragraph?.attrs?.spaceAfter).toBe(12);

    const marks = paragraph?.content?.[0]?.marks ?? [];
    const textStyle = marks.find((mark) => mark.type === "textStyle");
    const highlight = marks.find((mark) => mark.type === "highlight");
    expect(textStyle?.attrs?.fontFamily).toContain("Georgia");
    expect(textStyle?.attrs?.fontSize).toBe("20px");
    expect(textStyle?.attrs?.color).toBe("#dc2626");
    expect(highlight?.attrs?.color).toBe("#fef08a");
    expect(marks.some((mark) => mark.type === "bold")).toBe(true);

    const update = Y.encodeStateAsUpdate(ydoc);
    expect(update.byteLength).toBeGreaterThan(0);

    // Reload into a fresh editor instance (simulates document reopen).
    const reloaded = new Editor({
      extensions: createLegacyEditorExtensions(),
      content: restored,
    });
    expect(reloaded.getText()).toContain("Styled");
    reloaded.destroy();
  });
});
