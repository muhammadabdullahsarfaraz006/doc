"use client";

import type { Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Eraser,
  Heading1,
  Heading2,
  Heading3,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Redo2,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Table2,
  Underline,
  Undo2,
} from "lucide-react";
import { useEffect, useState } from "react";

import { ColorMenu } from "@/components/editor/toolbar/color-menu";
import { LinkDialog } from "@/components/editor/toolbar/link-dialog";
import { TableDialog } from "@/components/editor/toolbar/table-dialog";
import {
  ToolbarButton,
  ToolbarGroup,
  ToolbarSelect,
} from "@/components/editor/toolbar/toolbar-primitives";
import { Separator } from "@/components/ui/separator";
import { getActiveParagraphLayout } from "@/features/editor/extensions/paragraph-layout";
import {
  FONT_FAMILIES,
  FONT_SIZE_PRESETS,
  HIGHLIGHT_COLORS,
  LINE_HEIGHT_PRESETS,
  PARAGRAPH_SPACE_PRESETS,
  TEXT_COLORS,
  clampFontSize,
  formatFontSize,
  parseFontSize,
} from "@/features/editor/font-options";

type EditorToolbarProps = {
  editor: Editor | null;
  disabled?: boolean;
};

function blockTypeValue(editor: Editor): string {
  if (editor.isActive("heading", { level: 1 })) {
    return "h1";
  }
  if (editor.isActive("heading", { level: 2 })) {
    return "h2";
  }
  if (editor.isActive("heading", { level: 3 })) {
    return "h3";
  }
  return "paragraph";
}

export function EditorToolbar({ editor, disabled = false }: EditorToolbarProps) {
  const [, setTick] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [customSize, setCustomSize] = useState("");

  useEffect(() => {
    if (!editor) {
      return;
    }
    const update = () => setTick((value) => value + 1);
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor]);

  if (!editor) {
    return (
      <div className="flex h-11 items-center border-b border-[var(--border)] bg-[var(--surface)] px-3" />
    );
  }

  const isDisabled = disabled || !editor.isEditable;
  const textStyle = editor.getAttributes("textStyle") as {
    fontFamily?: string | null;
    fontSize?: string | null;
    color?: string | null;
  };
  const fontFamily = textStyle.fontFamily ?? "";
  const fontSizePx = parseFontSize(textStyle.fontSize);
  const fontSizeValue =
    fontSizePx &&
    (FONT_SIZE_PRESETS as readonly number[]).includes(fontSizePx)
      ? String(fontSizePx)
      : fontSizePx
        ? "custom"
        : "";
  const textColor =
    typeof textStyle.color === "string" ? textStyle.color : null;
  const highlight =
    typeof editor.getAttributes("highlight").color === "string"
      ? (editor.getAttributes("highlight").color as string)
      : null;

  const layoutType = editor.isActive("heading") ? "heading" : "paragraph";
  const layout = getActiveParagraphLayout(editor.getAttributes(layoutType));
  const inTable = editor.isActive("table");

  return (
    <>
      <div
        className="flex flex-wrap items-center gap-1 border-b border-[var(--border)] bg-[var(--surface)] px-2 py-1.5"
        role="toolbar"
        aria-label="Text formatting"
      >
        <ToolbarGroup label="Editing">
          <ToolbarButton
            label="Undo"
            disabled={isDisabled || !editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <Undo2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Redo"
            disabled={isDisabled || !editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
          >
            <Redo2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Clear formatting"
            disabled={isDisabled}
            onClick={() =>
              editor.chain().focus().unsetAllMarks().removeEmptyTextStyle().run()
            }
          >
            <Eraser className="h-4 w-4" />
          </ToolbarButton>
        </ToolbarGroup>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <ToolbarGroup label="Text">
          <ToolbarSelect
            label="Font family"
            value={fontFamily}
            disabled={isDisabled}
            className="max-w-[8.5rem]"
            onChange={(value) => {
              if (!value) {
                editor.chain().focus().unsetFontFamily().run();
                return;
              }
              editor.chain().focus().setFontFamily(value).run();
            }}
          >
            <option value="">Font</option>
            {FONT_FAMILIES.map((font) => (
              <option key={font.label} value={font.value}>
                {font.label}
              </option>
            ))}
          </ToolbarSelect>

          <ToolbarSelect
            label="Font size"
            value={fontSizeValue}
            disabled={isDisabled}
            className="max-w-[4.5rem]"
            onChange={(value) => {
              if (!value) {
                editor.chain().focus().unsetFontSize().run();
                setCustomSize("");
                return;
              }
              if (value === "custom") {
                return;
              }
              editor.chain().focus().setFontSize(formatFontSize(Number(value))).run();
              setCustomSize("");
            }}
          >
            <option value="">Size</option>
            {FONT_SIZE_PRESETS.map((size) => (
              <option key={size} value={String(size)}>
                {size}
              </option>
            ))}
            {fontSizeValue === "custom" && fontSizePx ? (
              <option value="custom">{fontSizePx}</option>
            ) : null}
          </ToolbarSelect>
          <input
            type="number"
            min={8}
            max={96}
            placeholder="pt"
            title="Custom font size"
            aria-label="Custom font size"
            disabled={isDisabled}
            value={customSize}
            onMouseDown={(event) => event.stopPropagation()}
            onChange={(event) => setCustomSize(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") {
                return;
              }
              const next = clampFontSize(Number(customSize));
              editor.chain().focus().setFontSize(formatFontSize(next)).run();
            }}
            className="h-8 w-14 rounded-md border border-[var(--border)] bg-[var(--surface)] px-1 text-xs disabled:opacity-50"
          />

          <ToolbarButton
            label="Bold"
            active={editor.isActive("bold")}
            disabled={isDisabled}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Italic"
            active={editor.isActive("italic")}
            disabled={isDisabled}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Underline"
            active={editor.isActive("underline")}
            disabled={isDisabled}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <Underline className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Strikethrough"
            active={editor.isActive("strike")}
            disabled={isDisabled}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Superscript"
            active={editor.isActive("superscript")}
            disabled={isDisabled}
            onClick={() =>
              editor
                .chain()
                .focus()
                .unsetSubscript()
                .toggleSuperscript()
                .run()
            }
          >
            <SuperscriptIcon className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Subscript"
            active={editor.isActive("subscript")}
            disabled={isDisabled}
            onClick={() =>
              editor
                .chain()
                .focus()
                .unsetSuperscript()
                .toggleSubscript()
                .run()
            }
          >
            <SubscriptIcon className="h-4 w-4" />
          </ToolbarButton>

          <ColorMenu
            label="Text color"
            colors={TEXT_COLORS}
            current={textColor}
            disabled={isDisabled}
            recentKey="ajaia-recent-text-colors"
            onSelect={(value) => {
              if (!value) {
                editor.chain().focus().unsetColor().run();
                return;
              }
              editor.chain().focus().setColor(value).run();
            }}
          />
          <ColorMenu
            label="Highlight"
            colors={HIGHLIGHT_COLORS}
            current={highlight}
            disabled={isDisabled}
            recentKey="ajaia-recent-highlight-colors"
            swatchClassName="ring-1 ring-black/10"
            onSelect={(value) => {
              if (!value) {
                editor.chain().focus().unsetHighlight().run();
                return;
              }
              editor.chain().focus().toggleHighlight({ color: value }).run();
            }}
          />
        </ToolbarGroup>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <ToolbarGroup label="Paragraph">
          <ToolbarSelect
            label="Style"
            value={blockTypeValue(editor)}
            disabled={isDisabled}
            className="max-w-[7rem]"
            onChange={(value) => {
              if (value === "h1") {
                editor.chain().focus().setHeading({ level: 1 }).run();
              } else if (value === "h2") {
                editor.chain().focus().setHeading({ level: 2 }).run();
              } else if (value === "h3") {
                editor.chain().focus().setHeading({ level: 3 }).run();
              } else {
                editor.chain().focus().setParagraph().run();
              }
            }}
          >
            <option value="paragraph">Normal</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
          </ToolbarSelect>

          <ToolbarButton
            label="Paragraph"
            active={editor.isActive("paragraph")}
            disabled={isDisabled}
            onClick={() => editor.chain().focus().setParagraph().run()}
          >
            <Pilcrow className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Heading 1"
            active={editor.isActive("heading", { level: 1 })}
            disabled={isDisabled}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
          >
            <Heading1 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Heading 2"
            active={editor.isActive("heading", { level: 2 })}
            disabled={isDisabled}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
          >
            <Heading2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Heading 3"
            active={editor.isActive("heading", { level: 3 })}
            disabled={isDisabled}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
          >
            <Heading3 className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarButton
            label="Align left"
            active={editor.isActive({ textAlign: "left" })}
            disabled={isDisabled}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
          >
            <AlignLeft className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Align center"
            active={editor.isActive({ textAlign: "center" })}
            disabled={isDisabled}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
          >
            <AlignCenter className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Align right"
            active={editor.isActive({ textAlign: "right" })}
            disabled={isDisabled}
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
          >
            <AlignRight className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Justify"
            active={editor.isActive({ textAlign: "justify" })}
            disabled={isDisabled}
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          >
            <AlignJustify className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarButton
            label="Decrease indent"
            disabled={isDisabled}
            onClick={() => editor.chain().focus().decreaseIndent().run()}
          >
            <IndentDecrease className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Increase indent"
            disabled={isDisabled}
            onClick={() => editor.chain().focus().increaseIndent().run()}
          >
            <IndentIncrease className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="First-line indent"
            active={layout.firstLineIndent > 0}
            disabled={isDisabled}
            onClick={() =>
              editor
                .chain()
                .focus()
                .setFirstLineIndent(layout.firstLineIndent > 0 ? 0 : 24)
                .run()
            }
          >
            <span className="text-[10px] font-semibold">1st</span>
          </ToolbarButton>
          <ToolbarButton
            label="Hanging indent"
            active={layout.firstLineIndent < 0}
            disabled={isDisabled}
            onClick={() => editor.chain().focus().toggleHangingIndent().run()}
          >
            <span className="text-[10px] font-semibold">Hang</span>
          </ToolbarButton>

          <ToolbarSelect
            label="Line spacing"
            value={layout.lineHeight ?? ""}
            disabled={isDisabled}
            className="max-w-[5.5rem]"
            onChange={(value) =>
              editor
                .chain()
                .focus()
                .setParagraphLineHeight(value || null)
                .run()
            }
          >
            <option value="">Line</option>
            {LINE_HEIGHT_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </ToolbarSelect>
          <ToolbarSelect
            label="Space before"
            value={String(layout.spaceBefore)}
            disabled={isDisabled}
            className="max-w-[5.5rem]"
            onChange={(value) =>
              editor.chain().focus().setSpaceBefore(Number(value)).run()
            }
          >
            {PARAGRAPH_SPACE_PRESETS.map((space) => (
              <option key={`before-${space}`} value={String(space)}>
                Before {space}
              </option>
            ))}
          </ToolbarSelect>
          <ToolbarSelect
            label="Space after"
            value={String(layout.spaceAfter)}
            disabled={isDisabled}
            className="max-w-[5.5rem]"
            onChange={(value) =>
              editor.chain().focus().setSpaceAfter(Number(value)).run()
            }
          >
            {PARAGRAPH_SPACE_PRESETS.map((space) => (
              <option key={`after-${space}`} value={String(space)}>
                After {space}
              </option>
            ))}
          </ToolbarSelect>

          <ToolbarButton
            label="Bullet list"
            active={editor.isActive("bulletList")}
            disabled={isDisabled}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Numbered list"
            active={editor.isActive("orderedList")}
            disabled={isDisabled}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Decrease list nest"
            disabled={isDisabled || !editor.can().liftListItem("listItem")}
            onClick={() => editor.chain().focus().liftListItem("listItem").run()}
          >
            <span className="text-[10px] font-semibold">Out</span>
          </ToolbarButton>
          <ToolbarButton
            label="Increase list nest"
            disabled={isDisabled || !editor.can().sinkListItem("listItem")}
            onClick={() => editor.chain().focus().sinkListItem("listItem").run()}
          >
            <span className="text-[10px] font-semibold">In</span>
          </ToolbarButton>
        </ToolbarGroup>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <ToolbarGroup label="Insert">
          <ToolbarButton
            label="Link"
            active={editor.isActive("link")}
            disabled={isDisabled}
            onClick={() => setLinkOpen(true)}
          >
            <Link2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Horizontal divider"
            disabled={isDisabled}
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          >
            <Minus className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Insert table"
            disabled={isDisabled}
            onClick={() => setTableOpen(true)}
          >
            <Table2 className="h-4 w-4" />
          </ToolbarButton>
          {inTable ? (
            <>
              <ToolbarButton
                label="Add row above"
                disabled={isDisabled}
                onClick={() => editor.chain().focus().addRowBefore().run()}
              >
                <span className="text-[10px] font-semibold">↑R</span>
              </ToolbarButton>
              <ToolbarButton
                label="Add row below"
                disabled={isDisabled}
                onClick={() => editor.chain().focus().addRowAfter().run()}
              >
                <span className="text-[10px] font-semibold">↓R</span>
              </ToolbarButton>
              <ToolbarButton
                label="Add column before"
                disabled={isDisabled}
                onClick={() => editor.chain().focus().addColumnBefore().run()}
              >
                <span className="text-[10px] font-semibold">←C</span>
              </ToolbarButton>
              <ToolbarButton
                label="Add column after"
                disabled={isDisabled}
                onClick={() => editor.chain().focus().addColumnAfter().run()}
              >
                <span className="text-[10px] font-semibold">→C</span>
              </ToolbarButton>
              <ToolbarButton
                label="Delete row"
                disabled={isDisabled}
                onClick={() => editor.chain().focus().deleteRow().run()}
              >
                <span className="text-[10px] font-semibold">−R</span>
              </ToolbarButton>
              <ToolbarButton
                label="Delete column"
                disabled={isDisabled}
                onClick={() => editor.chain().focus().deleteColumn().run()}
              >
                <span className="text-[10px] font-semibold">−C</span>
              </ToolbarButton>
              <ToolbarButton
                label="Delete table"
                disabled={isDisabled}
                onClick={() => editor.chain().focus().deleteTable().run()}
              >
                <span className="text-[10px] font-semibold">×T</span>
              </ToolbarButton>
            </>
          ) : null}
        </ToolbarGroup>
      </div>

      <LinkDialog
        editor={editor}
        open={linkOpen}
        onOpenChange={setLinkOpen}
      />
      <TableDialog
        editor={editor}
        open={tableOpen}
        onOpenChange={setTableOpen}
      />
    </>
  );
}
