import { isSafeLinkHref, normalizeLinkHref } from "@/features/editor/font-options";
import type { TipTapDocument } from "@/lib/validation/tiptap";

type TipTapMark = { type: string; attrs?: Record<string, unknown> };
type TipTapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  marks?: TipTapMark[];
  text?: string;
  content?: TipTapNode[];
};

export type ImportConvertResult =
  | { ok: true; document: TipTapDocument; titleHint: string }
  | { ok: false; error: string };

function pushText(
  nodes: TipTapNode[],
  text: string,
  marks: TipTapMark[] = [],
): void {
  if (!text) {
    return;
  }
  nodes.push({
    type: "text",
    text,
    ...(marks.length > 0 ? { marks } : {}),
  });
}

/**
 * Parse a limited Markdown inline subset: bold, italic, links.
 * Content is stored as plain TipTap text nodes (never executed as HTML).
 */
export function parseInlineMarkdown(input: string): TipTapNode[] {
  const nodes: TipTapNode[] = [];
  let i = 0;

  while (i < input.length) {
    if (input.startsWith("**", i) || input.startsWith("__", i)) {
      const delim = input.slice(i, i + 2);
      const end = input.indexOf(delim, i + 2);
      if (end !== -1) {
        const inner = input.slice(i + 2, end);
        const childNodes = parseInlineMarkdown(inner);
        for (const child of childNodes) {
          if (child.type === "text") {
            const marks = [...(child.marks ?? []), { type: "bold" }];
            pushText(nodes, child.text ?? "", marks);
          } else {
            nodes.push(child);
          }
        }
        i = end + 2;
        continue;
      }
    }

    if (
      (input[i] === "*" || input[i] === "_") &&
      input[i + 1] !== input[i]
    ) {
      const delim = input[i]!;
      const end = input.indexOf(delim, i + 1);
      if (end !== -1 && end > i + 1) {
        const inner = input.slice(i + 1, end);
        const childNodes = parseInlineMarkdown(inner);
        for (const child of childNodes) {
          if (child.type === "text") {
            const marks = [...(child.marks ?? []), { type: "italic" }];
            pushText(nodes, child.text ?? "", marks);
          } else {
            nodes.push(child);
          }
        }
        i = end + 1;
        continue;
      }
    }

    if (input[i] === "[") {
      const closeLabel = input.indexOf("]", i + 1);
      if (
        closeLabel !== -1 &&
        input[closeLabel + 1] === "(" &&
        input.indexOf(")", closeLabel + 2) !== -1
      ) {
        const closeUrl = input.indexOf(")", closeLabel + 2);
        const label = input.slice(i + 1, closeLabel);
        const rawHref = input.slice(closeLabel + 2, closeUrl);
        const href = normalizeLinkHref(rawHref);
        if (label && isSafeLinkHref(href)) {
          pushText(nodes, label, [{ type: "link", attrs: { href } }]);
          i = closeUrl + 1;
          continue;
        }
      }
    }

    // Consume plain text until the next special character.
    let next = i + 1;
    while (next < input.length) {
      const ch = input[next]!;
      if (
        ch === "*" ||
        ch === "_" ||
        ch === "[" ||
        (ch === "*" && input[next + 1] === "*")
      ) {
        break;
      }
      next += 1;
    }
    pushText(nodes, input.slice(i, next));
    i = next;
  }

  return nodes;
}

function paragraphFromText(text: string): TipTapNode {
  const trimmed = text.trimEnd();
  if (!trimmed) {
    return { type: "paragraph" };
  }
  return {
    type: "paragraph",
    content: parseInlineMarkdown(trimmed),
  };
}

function headingFromText(level: 1 | 2 | 3, text: string): TipTapNode {
  const content = parseInlineMarkdown(text.trim());
  return {
    type: "heading",
    attrs: { level },
    ...(content.length > 0 ? { content } : {}),
  };
}

function isBullet(line: string): boolean {
  return /^(\s*)([-*+])\s+/.test(line);
}

function isOrdered(line: string): boolean {
  return /^(\s*)\d+\.\s+/.test(line);
}

function listItemText(line: string): string {
  return line.replace(/^(\s*)([-*+]|\d+\.)\s+/, "");
}

function indentLevel(line: string): number {
  const match = /^(\s*)/.exec(line);
  const spaces = match?.[1]?.length ?? 0;
  return Math.min(3, Math.floor(spaces / 2));
}

function buildList(
  lines: string[],
  start: number,
  ordered: boolean,
  level: number,
): { node: TipTapNode; nextIndex: number } {
  const items: TipTapNode[] = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      break;
    }
    const bullet = isBullet(line);
    const numbered = isOrdered(line);
    if (!bullet && !numbered) {
      break;
    }
    if ((ordered && !numbered) || (!ordered && !bullet)) {
      break;
    }
    const currentLevel = indentLevel(line);
    if (currentLevel < level) {
      break;
    }
    if (currentLevel > level) {
      const nested = buildList(lines, i, numbered, currentLevel);
      const last = items[items.length - 1];
      if (last) {
        last.content = [...(last.content ?? []), nested.node];
      } else {
        items.push({
          type: "listItem",
          content: [{ type: "paragraph" }, nested.node],
        });
      }
      i = nested.nextIndex;
      continue;
    }

    const text = listItemText(line);
    const itemContent: TipTapNode[] = [paragraphFromText(text)];
    i += 1;

    if (i < lines.length) {
      const next = lines[i]!;
      if (
        (isBullet(next) || isOrdered(next)) &&
        indentLevel(next) > level
      ) {
        const nested = buildList(
          lines,
          i,
          isOrdered(next),
          indentLevel(next),
        );
        itemContent.push(nested.node);
        i = nested.nextIndex;
      }
    }

    items.push({ type: "listItem", content: itemContent });
  }

  return {
    node: {
      type: ordered ? "orderedList" : "bulletList",
      content: items,
    },
    nextIndex: i,
  };
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

export function assertImportText(raw: string): { ok: true; text: string } | {
  ok: false;
  error: string;
} {
  if (raw.includes("\u0000")) {
    return {
      ok: false,
      error: "File appears to be binary or contains invalid characters.",
    };
  }
  const text = stripBom(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!text.trim()) {
    return { ok: false, error: "File is empty." };
  }
  return { ok: true, text };
}

export function convertPlainTextToTipTap(raw: string): ImportConvertResult {
  const checked = assertImportText(raw);
  if (!checked.ok) {
    return checked;
  }

  const blocks = checked.text.split(/\n{2,}/);
  const content: TipTapNode[] = blocks.map((block) => {
    const lines = block.split("\n").map((line) => line.trimEnd());
    return paragraphFromText(lines.join("\n"));
  });

  return {
    ok: true,
    document: {
      type: "doc",
      content: content.length > 0 ? content : [{ type: "paragraph" }],
    },
    titleHint: "",
  };
}

export function convertMarkdownToTipTap(raw: string): ImportConvertResult {
  const checked = assertImportText(raw);
  if (!checked.ok) {
    return checked;
  }

  const lines = checked.text.split("\n");
  const content: TipTapNode[] = [];
  let i = 0;
  let titleHint = "";

  while (i < lines.length) {
    const line = lines[i]!;

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(line);
    if (headingMatch) {
      const level = Math.min(3, headingMatch[1]!.length) as 1 | 2 | 3;
      const text = headingMatch[2] ?? "";
      content.push(headingFromText(level, text));
      if (!titleHint && level === 1 && text.trim()) {
        titleHint = text.trim();
      }
      i += 1;
      continue;
    }

    if (isBullet(line) || isOrdered(line)) {
      const list = buildList(lines, i, isOrdered(line), indentLevel(line));
      content.push(list.node);
      i = list.nextIndex;
      continue;
    }

    // Fenced code / unsupported blocks: import as plain paragraphs (safe text).
    if (line.trim().startsWith("```")) {
      i += 1;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i]!.trim().startsWith("```")) {
        codeLines.push(lines[i]!);
        i += 1;
      }
      if (i < lines.length) {
        i += 1;
      }
      content.push({
        type: "paragraph",
        content: [{ type: "text", text: codeLines.join("\n") || " " }],
      });
      continue;
    }

    const paraLines: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !/^(#{1,3})\s+/.test(lines[i]!) &&
      !isBullet(lines[i]!) &&
      !isOrdered(lines[i]!) &&
      !lines[i]!.trim().startsWith("```")
    ) {
      paraLines.push(lines[i]!);
      i += 1;
    }
    content.push(paragraphFromText(paraLines.join(" ")));
  }

  return {
    ok: true,
    document: {
      type: "doc",
      content: content.length > 0 ? content : [{ type: "paragraph" }],
    },
    titleHint,
  };
}

export function convertImportFile(options: {
  extension: "txt" | "md";
  text: string;
  fileName: string;
}): ImportConvertResult {
  const converted =
    options.extension === "md"
      ? convertMarkdownToTipTap(options.text)
      : convertPlainTextToTipTap(options.text);

  if (!converted.ok) {
    return converted;
  }

  const baseName = options.fileName.replace(/\.(txt|md|markdown)$/i, "").trim();
  const titleHint =
    converted.titleHint || baseName || "Imported document";

  return {
    ok: true,
    document: converted.document,
    titleHint: titleHint.slice(0, 200),
  };
}
