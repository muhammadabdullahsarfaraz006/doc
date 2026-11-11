import { describe, expect, it } from "vitest";

import {
  isTipTapDocument,
  normalizeTipTapDocument,
} from "@/lib/validation/tiptap";

describe("tipTapDocument validation", () => {
  it("accepts a document with headings and lists", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", marks: [{ type: "bold" }], text: "Bold" },
            { type: "text", text: " and " },
            { type: "text", marks: [{ type: "italic" }], text: "italic" },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Item" }],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(isTipTapDocument(doc)).toBe(true);
  });

  it("normalizes invalid content to an empty document", () => {
    const normalized = normalizeTipTapDocument({ hello: "world" });
    expect(normalized.type).toBe("doc");
    expect(normalized.content?.[0]).toMatchObject({ type: "paragraph" });
  });
});
