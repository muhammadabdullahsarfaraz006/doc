"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { convertImportFile } from "@/features/import/convert";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_IMPORT_BYTES,
  validateImportFileMeta,
} from "@/lib/validation/import";
import { documentTitleSchema } from "@/lib/validation/documents";
import {
  normalizeTipTapDocument,
  tipTapDocumentSchema,
} from "@/lib/validation/tiptap";
import type { Json } from "@/types/database";

export type ImportDocumentResult =
  | { ok: true; documentId: string }
  | { ok: false; error: string };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      supabase,
      user: null,
      error: "Your session has expired. Please sign in again.",
    };
  }

  return { supabase, user, error: null };
}

async function readAndValidateImportFile(file: File): Promise<
  | {
      ok: true;
      extension: "txt" | "md";
      text: string;
      title: string;
      content: ReturnType<typeof normalizeTipTapDocument>;
    }
  | { ok: false; error: string }
> {
  const meta = validateImportFileMeta({
    name: file.name,
    size: file.size,
    type: file.type,
  });
  if (!meta.success) {
    return { ok: false, error: meta.error };
  }

  if (file.size > MAX_IMPORT_BYTES) {
    return { ok: false, error: "File must be 2 MB or smaller." };
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return {
      ok: false,
      error: "Could not read the file. Upload a valid UTF-8 text file.",
    };
  }

  const converted = convertImportFile({
    extension: meta.data.extension,
    text,
    fileName: file.name,
  });
  if (!converted.ok) {
    return { ok: false, error: converted.error };
  }

  const contentParsed = tipTapDocumentSchema.safeParse(converted.document);
  if (!contentParsed.success) {
    return {
      ok: false,
      error: "Imported content could not be converted to a document.",
    };
  }

  const title = documentTitleSchema.parse(converted.titleHint);
  return {
    ok: true,
    extension: meta.data.extension,
    text,
    title,
    content: normalizeTipTapDocument(contentParsed.data),
  };
}

/**
 * Create a new document from an uploaded .txt or .md file.
 * Content is stored as TipTap JSON (legacy/migration source for Yjs init).
 */
export async function importDocumentAction(
  formData: FormData,
): Promise<ImportDocumentResult> {
  const { supabase, user, error } = await requireUser();
  if (!user) {
    return { ok: false, error: error ?? "Unauthorized" };
  }

  const fileValue = formData.get("file");
  if (!(fileValue instanceof File)) {
    return { ok: false, error: "Choose a .txt or .md file to import." };
  }

  const validated = await readAndValidateImportFile(fileValue);
  if (!validated.ok) {
    return validated;
  }

  const id = crypto.randomUUID();
  const { error: insertError } = await supabase.from("documents").insert({
    id,
    title: validated.title,
    owner_id: user.id,
    content: validated.content as NonNullable<Json>,
  });

  if (insertError) {
    return {
      ok: false,
      error: insertError.message || "Could not create the imported document.",
    };
  }

  const { data: created, error: fetchError } = await supabase
    .from("documents")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !created) {
    return {
      ok: false,
      error:
        "Document was created but could not be opened. Refresh and try again.",
    };
  }

  revalidatePath("/dashboard");
  redirect(`/documents/${created.id}`);
}

/**
 * Parse and validate an import file without creating a document.
 * Used by the editor to replace content client-side (Yjs sync).
 */
export async function parseImportFileAction(
  formData: FormData,
): Promise<
  | { ok: true; title: string; content: ReturnType<typeof normalizeTipTapDocument> }
  | { ok: false; error: string }
> {
  const { user, error } = await requireUser();
  if (!user) {
    return { ok: false, error: error ?? "Unauthorized" };
  }

  const fileValue = formData.get("file");
  if (!(fileValue instanceof File)) {
    return { ok: false, error: "Choose a .txt or .md file to import." };
  }

  const validated = await readAndValidateImportFile(fileValue);
  if (!validated.ok) {
    return validated;
  }

  return {
    ok: true,
    title: validated.title,
    content: validated.content,
  };
}
