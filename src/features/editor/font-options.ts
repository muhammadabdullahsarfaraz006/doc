export const FONT_FAMILIES = [
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Inter", value: "Inter, ui-sans-serif, system-ui, sans-serif" },
  { label: "Roboto", value: "Roboto, Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  {
    label: "Times New Roman",
    value: '"Times New Roman", Times, serif',
  },
  { label: "Courier New", value: '"Courier New", Courier, monospace' },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
] as const;

export const FONT_SIZE_PRESETS = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72,
] as const;

export const FONT_SIZE_MIN = 8;
export const FONT_SIZE_MAX = 96;

export const TEXT_COLORS = [
  { label: "Default", value: null },
  { label: "Black", value: "#111827" },
  { label: "Gray", value: "#6b7280" },
  { label: "Red", value: "#dc2626" },
  { label: "Orange", value: "#ea580c" },
  { label: "Amber", value: "#d97706" },
  { label: "Green", value: "#16a34a" },
  { label: "Teal", value: "#0d9488" },
  { label: "Blue", value: "#2563eb" },
  { label: "Indigo", value: "#4f46e5" },
  { label: "Purple", value: "#9333ea" },
  { label: "Pink", value: "#db2777" },
] as const;

export const HIGHLIGHT_COLORS = [
  { label: "None", value: null },
  { label: "Yellow", value: "#fef08a" },
  { label: "Lime", value: "#d9f99d" },
  { label: "Cyan", value: "#a5f3fc" },
  { label: "Sky", value: "#bae6fd" },
  { label: "Violet", value: "#ddd6fe" },
  { label: "Pink", value: "#fbcfe8" },
  { label: "Orange", value: "#fed7aa" },
  { label: "Gray", value: "#e5e7eb" },
] as const;

export const LINE_HEIGHT_PRESETS = [
  { label: "Single", value: "1" },
  { label: "1.15", value: "1.15" },
  { label: "1.5", value: "1.5" },
  { label: "Double", value: "2" },
] as const;

export const PARAGRAPH_SPACE_PRESETS = [0, 4, 8, 12, 16, 24, 32, 48] as const;

export const INDENT_STEP_PX = 24;
export const INDENT_MAX_LEVEL = 8;
export const FIRST_LINE_INDENT_STEP_PX = 24;
export const FIRST_LINE_INDENT_MAX_PX = 96;

export function clampFontSize(size: number): number {
  if (!Number.isFinite(size)) {
    return 16;
  }
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(size)));
}

export function formatFontSize(px: number): string {
  return `${clampFontSize(px)}px`;
}

export function parseFontSize(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = /^(\d+(?:\.\d+)?)px$/i.exec(value.trim());
  if (!match) {
    return null;
  }
  return clampFontSize(Number.parseFloat(match[1]!));
}

export function isSafeLinkHref(href: string): boolean {
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

export function normalizeLinkHref(href: string): string {
  const trimmed = href.trim();
  if (/^mailto:/i.test(trimmed)) {
    return trimmed;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}
