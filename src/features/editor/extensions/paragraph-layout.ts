import { Extension } from "@tiptap/core";

import {
  FIRST_LINE_INDENT_MAX_PX,
  FIRST_LINE_INDENT_STEP_PX,
  INDENT_MAX_LEVEL,
  INDENT_STEP_PX,
  PARAGRAPH_SPACE_PRESETS,
} from "@/features/editor/font-options";

export type ParagraphLayoutAttrs = {
  indent: number;
  firstLineIndent: number;
  lineHeight: string | null;
  spaceBefore: number;
  spaceAfter: number;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    paragraphLayout: {
      increaseIndent: () => ReturnType;
      decreaseIndent: () => ReturnType;
      setFirstLineIndent: (px: number) => ReturnType;
      toggleHangingIndent: () => ReturnType;
      setParagraphLineHeight: (value: string | null) => ReturnType;
      setSpaceBefore: (px: number) => ReturnType;
      setSpaceAfter: (px: number) => ReturnType;
    };
  }
}

function clampIndent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(INDENT_MAX_LEVEL, Math.max(0, Math.round(value)));
}

function clampFirstLine(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(
    FIRST_LINE_INDENT_MAX_PX,
    Math.max(-FIRST_LINE_INDENT_MAX_PX, Math.round(value)),
  );
}

function clampSpace(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const rounded = Math.round(value);
  if ((PARAGRAPH_SPACE_PRESETS as readonly number[]).includes(rounded)) {
    return rounded;
  }
  return Math.min(48, Math.max(0, rounded));
}

function parseLineHeight(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === "normal") {
    return null;
  }
  const numeric = Number.parseFloat(trimmed);
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 3) {
    return null;
  }
  return String(numeric);
}

function layoutStyle(attrs: Partial<ParagraphLayoutAttrs>): Record<string, string> {
  const indent = clampIndent(attrs.indent ?? 0);
  const firstLineIndent = clampFirstLine(attrs.firstLineIndent ?? 0);
  const spaceBefore = clampSpace(attrs.spaceBefore ?? 0);
  const spaceAfter = clampSpace(attrs.spaceAfter ?? 0);
  const lineHeight = parseLineHeight(attrs.lineHeight ?? null);

  const hangingExtra = firstLineIndent < 0 ? Math.abs(firstLineIndent) : 0;
  const paddingLeft = indent * INDENT_STEP_PX + hangingExtra;

  const style: Record<string, string> = {};
  if (paddingLeft > 0) {
    style["padding-left"] = `${paddingLeft}px`;
  }
  if (firstLineIndent !== 0) {
    style["text-indent"] = `${firstLineIndent}px`;
  }
  if (lineHeight) {
    style["line-height"] = lineHeight;
  }
  if (spaceBefore > 0) {
    style["margin-top"] = `${spaceBefore}px`;
  }
  if (spaceAfter > 0) {
    style["margin-bottom"] = `${spaceAfter}px`;
  }
  return style;
}

function styleToString(style: Record<string, string>): string | undefined {
  const entries = Object.entries(style);
  if (entries.length === 0) {
    return undefined;
  }
  return entries.map(([key, value]) => `${key}: ${value}`).join("; ");
}

function updateActiveBlocks(
  types: string[],
  editor: { isActive: (name: string) => boolean },
  commands: {
    updateAttributes: (
      type: string,
      attrs: Record<string, unknown>,
    ) => boolean;
  },
  attrs: Record<string, unknown>,
): boolean {
  const activeTypes = types.filter((type) => editor.isActive(type));
  const targets = activeTypes.length > 0 ? activeTypes : types;
  let any = false;
  for (const type of targets) {
    if (commands.updateAttributes(type, attrs)) {
      any = true;
    }
  }
  return any;
}

export const ParagraphLayout = Extension.create({
  name: "paragraphLayout",

  addOptions() {
    return {
      types: ["paragraph", "heading"],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element: HTMLElement) => {
              const raw = element.getAttribute("data-indent");
              return clampIndent(raw ? Number.parseInt(raw, 10) : 0);
            },
            renderHTML: (attributes: Record<string, unknown>) => {
              const indent = clampIndent(Number(attributes.indent ?? 0));
              const style = styleToString(
                layoutStyle({
                  indent,
                  firstLineIndent: Number(attributes.firstLineIndent ?? 0),
                  lineHeight:
                    typeof attributes.lineHeight === "string"
                      ? attributes.lineHeight
                      : null,
                  spaceBefore: Number(attributes.spaceBefore ?? 0),
                  spaceAfter: Number(attributes.spaceAfter ?? 0),
                }),
              );
              const html: Record<string, string> = {};
              if (indent > 0) {
                html["data-indent"] = String(indent);
              }
              if (style) {
                html.style = style;
              }
              return html;
            },
          },
          firstLineIndent: {
            default: 0,
            parseHTML: (element: HTMLElement) => {
              const raw = element.getAttribute("data-first-line-indent");
              return clampFirstLine(raw ? Number.parseInt(raw, 10) : 0);
            },
            renderHTML: (attributes: Record<string, unknown>) => {
              const value = clampFirstLine(
                Number(attributes.firstLineIndent ?? 0),
              );
              return value === 0
                ? {}
                : { "data-first-line-indent": String(value) };
            },
          },
          lineHeight: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              parseLineHeight(element.getAttribute("data-line-height")),
            renderHTML: (attributes: Record<string, unknown>) => {
              const value = parseLineHeight(
                typeof attributes.lineHeight === "string"
                  ? attributes.lineHeight
                  : null,
              );
              return value ? { "data-line-height": value } : {};
            },
          },
          spaceBefore: {
            default: 0,
            parseHTML: (element: HTMLElement) => {
              const raw = element.getAttribute("data-space-before");
              return clampSpace(raw ? Number.parseInt(raw, 10) : 0);
            },
            renderHTML: (attributes: Record<string, unknown>) => {
              const value = clampSpace(Number(attributes.spaceBefore ?? 0));
              return value === 0
                ? {}
                : { "data-space-before": String(value) };
            },
          },
          spaceAfter: {
            default: 0,
            parseHTML: (element: HTMLElement) => {
              const raw = element.getAttribute("data-space-after");
              return clampSpace(raw ? Number.parseInt(raw, 10) : 0);
            },
            renderHTML: (attributes: Record<string, unknown>) => {
              const value = clampSpace(Number(attributes.spaceAfter ?? 0));
              return value === 0 ? {} : { "data-space-after": String(value) };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      increaseIndent:
        () =>
        ({ commands, editor }) =>
          updateActiveBlocks(this.options.types, editor, commands, {
            indent: clampIndent(
              Number(
                editor.getAttributes(
                  editor.isActive("heading") ? "heading" : "paragraph",
                ).indent ?? 0,
              ) + 1,
            ),
          }),
      decreaseIndent:
        () =>
        ({ commands, editor }) =>
          updateActiveBlocks(this.options.types, editor, commands, {
            indent: clampIndent(
              Number(
                editor.getAttributes(
                  editor.isActive("heading") ? "heading" : "paragraph",
                ).indent ?? 0,
              ) - 1,
            ),
          }),
      setFirstLineIndent:
        (px: number) =>
        ({ commands, editor }) =>
          updateActiveBlocks(this.options.types, editor, commands, {
            firstLineIndent: clampFirstLine(px),
          }),
      toggleHangingIndent:
        () =>
        ({ commands, editor }) => {
          const type = editor.isActive("heading") ? "heading" : "paragraph";
          const attrs = editor.getAttributes(type);
          const current = clampFirstLine(Number(attrs.firstLineIndent ?? 0));
          const indent = clampIndent(Number(attrs.indent ?? 0));
          if (current < 0) {
            return updateActiveBlocks(this.options.types, editor, commands, {
              firstLineIndent: 0,
            });
          }
          return updateActiveBlocks(this.options.types, editor, commands, {
            firstLineIndent: -FIRST_LINE_INDENT_STEP_PX,
            indent: Math.max(1, indent),
          });
        },
      setParagraphLineHeight:
        (value: string | null) =>
        ({ commands, editor }) =>
          updateActiveBlocks(this.options.types, editor, commands, {
            lineHeight: parseLineHeight(value),
          }),
      setSpaceBefore:
        (px: number) =>
        ({ commands, editor }) =>
          updateActiveBlocks(this.options.types, editor, commands, {
            spaceBefore: clampSpace(px),
          }),
      setSpaceAfter:
        (px: number) =>
        ({ commands, editor }) =>
          updateActiveBlocks(this.options.types, editor, commands, {
            spaceAfter: clampSpace(px),
          }),
    };
  },
});

export function getActiveParagraphLayout(
  attrs: Record<string, unknown>,
): ParagraphLayoutAttrs {
  return {
    indent: clampIndent(Number(attrs.indent ?? 0)),
    firstLineIndent: clampFirstLine(Number(attrs.firstLineIndent ?? 0)),
    lineHeight: parseLineHeight(
      typeof attrs.lineHeight === "string" ? attrs.lineHeight : null,
    ),
    spaceBefore: clampSpace(Number(attrs.spaceBefore ?? 0)),
    spaceAfter: clampSpace(Number(attrs.spaceAfter ?? 0)),
  };
}

export const paragraphLayoutHelpers = {
  clampIndent,
  clampFirstLine,
  clampSpace,
  parseLineHeight,
  layoutStyle,
  INDENT_STEP_PX,
};
