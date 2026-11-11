import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";

import { createLegacyEditorExtensions } from "@/features/editor/extensions";
import { paragraphLayoutHelpers } from "@/features/editor/extensions/paragraph-layout";
import {
  clampFontSize,
  formatFontSize,
  isSafeLinkHref,
  normalizeLinkHref,
  parseFontSize,
} from "@/features/editor/font-options";

function createEditor() {
  return new Editor({
    extensions: createLegacyEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello world" }],
        },
      ],
    },
  });
}

describe("font option helpers", () => {
  it("clamps and formats font sizes", () => {
    expect(clampFontSize(4)).toBe(8);
    expect(clampFontSize(200)).toBe(96);
    expect(formatFontSize(16)).toBe("16px");
    expect(parseFontSize("18px")).toBe(18);
    expect(parseFontSize("bogus")).toBeNull();
  });

  it("validates safe link protocols", () => {
    expect(isSafeLinkHref("https://example.com")).toBe(true);
    expect(isSafeLinkHref("mailto:a@b.com")).toBe(true);
    expect(isSafeLinkHref("javascript:alert(1)")).toBe(false);
    expect(normalizeLinkHref("example.com")).toBe("https://example.com");
  });
});

describe("paragraph layout helpers", () => {
  it("bounds indentation and spacing", () => {
    expect(paragraphLayoutHelpers.clampIndent(-2)).toBe(0);
    expect(paragraphLayoutHelpers.clampIndent(99)).toBe(8);
    expect(paragraphLayoutHelpers.clampFirstLine(200)).toBe(96);
    expect(paragraphLayoutHelpers.clampFirstLine(-200)).toBe(-96);
    expect(paragraphLayoutHelpers.clampSpace(12)).toBe(12);
    expect(paragraphLayoutHelpers.parseLineHeight("1.5")).toBe("1.5");
    expect(paragraphLayoutHelpers.parseLineHeight("9")).toBeNull();
  });

  it("renders hanging indent as padding + negative text-indent", () => {
    const style = paragraphLayoutHelpers.layoutStyle({
      indent: 1,
      firstLineIndent: -24,
      lineHeight: "1.5",
      spaceBefore: 8,
      spaceAfter: 16,
    });
    expect(style["padding-left"]).toBe("48px");
    expect(style["text-indent"]).toBe("-24px");
    expect(style["line-height"]).toBe("1.5");
    expect(style["margin-top"]).toBe("8px");
    expect(style["margin-bottom"]).toBe("16px");
  });
});

describe("TipTap formatting schema", () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
  });

  it("applies font family, size, color, and highlight marks", () => {
    editor = createEditor();
    editor.commands.selectAll();
    editor.commands.setFontFamily("Georgia, serif");
    editor.commands.setFontSize("18px");
    editor.commands.setColor("#2563eb");
    editor.commands.toggleHighlight({ color: "#fef08a" });

    const json = editor.getJSON();
    const marks = json.content?.[0]?.content?.[0]?.marks ?? [];
    const textStyle = marks.find((mark) => mark.type === "textStyle");
    const highlight = marks.find((mark) => mark.type === "highlight");
    expect(textStyle?.attrs?.fontFamily).toBe("Georgia, serif");
    expect(textStyle?.attrs?.fontSize).toBe("18px");
    expect(textStyle?.attrs?.color).toBe("#2563eb");
    expect(highlight?.attrs?.color).toBe("#fef08a");
  });

  it("applies alignment, indent, line height, and paragraph spacing", () => {
    editor = createEditor();
    editor.commands.selectAll();
    editor.commands.setTextAlign("center");
    editor.commands.increaseIndent();
    editor.commands.setFirstLineIndent(24);
    editor.commands.setParagraphLineHeight("1.5");
    editor.commands.setSpaceBefore(8);
    editor.commands.setSpaceAfter(16);

    const paragraph = editor.getJSON().content?.[0];
    expect(paragraph?.attrs?.textAlign).toBe("center");
    expect(paragraph?.attrs?.indent).toBe(1);
    expect(paragraph?.attrs?.firstLineIndent).toBe(24);
    expect(paragraph?.attrs?.lineHeight).toBe("1.5");
    expect(paragraph?.attrs?.spaceBefore).toBe(8);
    expect(paragraph?.attrs?.spaceAfter).toBe(16);
  });

  it("supports superscript, subscript, strike, and clear formatting", () => {
    editor = createEditor();
    editor.commands.selectAll();
    editor.commands.toggleStrike();
    editor.commands.toggleSuperscript();
    expect(editor.isActive("strike")).toBe(true);
    expect(editor.isActive("superscript")).toBe(true);

    editor.commands.unsetSuperscript();
    editor.commands.toggleSubscript();
    expect(editor.isActive("subscript")).toBe(true);

    editor.commands.unsetAllMarks();
    expect(editor.isActive("strike")).toBe(false);
    expect(editor.isActive("subscript")).toBe(false);
  });

  it("inserts safe links and rejects javascript urls via helper", () => {
    editor = createEditor();
    editor.commands.selectAll();
    editor.commands.setLink({ href: "https://ajaia.example" });
    expect(editor.isActive("link")).toBe(true);
    expect(editor.getAttributes("link").href).toBe("https://ajaia.example");
    expect(isSafeLinkHref("javascript:void(0)")).toBe(false);
  });

  it("inserts tables and preserves structure in JSON", () => {
    editor = createEditor();
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
    const json = editor.getJSON();
    const table = json.content?.find((node) => node.type === "table");
    expect(table).toBeTruthy();
    expect(table?.content?.length).toBe(2);
  });

  it("creates nested lists", () => {
    editor = createEditor();
    editor.commands.toggleBulletList();
    expect(editor.isActive("bulletList")).toBe(true);
    editor.commands.sinkListItem("listItem");
    const json = editor.getJSON();
    expect(json.content?.[0]?.type).toBe("bulletList");
  });
});
