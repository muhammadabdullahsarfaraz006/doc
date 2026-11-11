import { z } from "zod";

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export const importExtensionSchema = z.enum(["txt", "md"]);

export const importFileMetaSchema = z.object({
  name: z.string().min(1),
  size: z
    .number()
    .int()
    .positive()
    .max(MAX_IMPORT_BYTES, "File must be 2 MB or smaller"),
  type: z.string(),
  extension: importExtensionSchema,
});

const ALLOWED_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/octet-stream",
  "",
]);

export function getImportExtension(
  fileName: string,
): z.infer<typeof importExtensionSchema> | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".txt")) return "txt";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "md";
  return null;
}

export function validateImportFileMeta(file: {
  name: string;
  size: number;
  type: string;
}): { success: true; data: z.infer<typeof importFileMetaSchema> } | {
  success: false;
  error: string;
} {
  const extension = getImportExtension(file.name);

  if (!extension) {
    return { success: false, error: "Only .txt and .md files are supported" };
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return {
      success: false,
      error: "Unsupported file type. Upload a plain text or Markdown file.",
    };
  }

  const parsed = importFileMetaSchema.safeParse({
    name: file.name,
    size: file.size,
    type: file.type,
    extension,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid file",
    };
  }

  return { success: true, data: parsed.data };
}
