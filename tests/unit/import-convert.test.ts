import { describe, expect, it } from "vitest";

import {
  convertImportFile,
  convertMarkdownToTipTap,
  convertPlainTextToTipTap,
  parseInlineMarkdown,
} from "@/features/import/convert";
import {
  getImportExtension,
  validateImportFileMeta,
} from "@/lib/validation/import";

describe("import file validation", () => {
  it("accepts txt and md metadata within size limits", () => {
    expect(
      validateImportFileMeta({
        name: "notes.txt",
        size: 100,
        type: "text/plain",
      }).success,
    ).toBe(true);
    expect(
      validateImportFileMeta({
        name: "readme.md",
        size: 100,
        type: "text/markdown",
      }).success,
    ).toBe(true);
  });

  it("rejects unsupported extensions and oversized files", () => {
    expect(
      validateImportFileMeta({
        name: "photo.png",
        size: 100,
        type: "image/png",
      }).success,
    ).toBe(false);
    expect(
      validateImportFileMeta({
        name: "big.txt",
        size: 3 * 1024 * 1024,
        type: "text/plain",
      }).success,
    ).toBe(false);
    expect(getImportExtension("doc.markdown")).toBe("md");
  });
});

describe("plain text conversion", () => {
  it("maps paragraphs separated by blank lines", () => {
    const result = convertPlainTextToTipTap("Hello\n\nWorld");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.document.content).toHaveLength(2);
    expect(result.document.content?.[0]?.content?.[0]?.text).toBe("Hello");
  });

  it("rejects empty and binary payloads", () => {
    expect(convertPlainTextToTipTap("   ").ok).toBe(false);
    expect(convertPlainTextToTipTap("a\u0000b").ok).toBe(false);
  });
});

describe("markdown conversion", () => {
  it("parses headings, emphasis, links, and lists", () => {
    const md = `# Title

Paragraph with **bold** and *italic* plus [docs](https://example.com).

- One
- Two

1. First
2. Second
`;
    const result = convertMarkdownToTipTap(md);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.titleHint).toBe("Title");
    expect(result.document.content?.[0]?.type).toBe("heading");
    expect(result.document.content?.[0]?.attrs?.level).toBe(1);

    const paragraph = result.document.content?.[1];
    const marks =
      paragraph?.content?.flatMap((node) => node.marks ?? []) ?? [];
    expect(marks.some((mark) => mark.type === "bold")).toBe(true);
    expect(marks.some((mark) => mark.type === "italic")).toBe(true);
    expect(
      marks.some(
        (mark) =>
          mark.type === "link" &&
          mark.attrs?.href === "https://example.com",
      ),
    ).toBe(true);

    expect(
      result.document.content?.some((node) => node.type === "bulletList"),
    ).toBe(true);
    expect(
      result.document.content?.some((node) => node.type === "orderedList"),
    ).toBe(true);
  });

  it("rejects javascript links in inline markdown", () => {
    const nodes = parseInlineMarkdown("[x](javascript:alert(1))");
    expect(nodes.every((node) => !(node.marks ?? []).some((m) => m.type === "link"))).toBe(
      true,
    );
  });

  it("imports code fences as plain text paragraphs", () => {
    const result = convertMarkdownToTipTap("```\ncode\n```\n");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.document.content?.[0]?.content?.[0]?.text).toBe("code");
  });

  it("derive title from filename when no H1", () => {
    const result = convertImportFile({
      extension: "txt",
      text: "Body only",
      fileName: "sprint-notes.txt",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.titleHint).toBe("sprint-notes");
  });
});
