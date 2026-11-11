import { z } from "zod";

import { EMPTY_TIPTAP_DOC } from "@/types/database";

type TipTapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
  content?: TipTapNode[];
};

const tipTapNodeSchema: z.ZodType<TipTapNode> = z.lazy(() =>
  z.object({
    type: z.string().min(1),
    attrs: z.record(z.unknown()).optional(),
    marks: z
      .array(
        z.object({
          type: z.string().min(1),
          attrs: z.record(z.unknown()).optional(),
        }),
      )
      .optional(),
    text: z.string().optional(),
    content: z.array(tipTapNodeSchema).optional(),
  }),
);

export const tipTapDocumentSchema = z.object({
  type: z.literal("doc"),
  attrs: z.record(z.unknown()).optional(),
  content: z.array(tipTapNodeSchema).optional(),
});

export type TipTapDocument = z.infer<typeof tipTapDocumentSchema>;

export function isTipTapDocument(value: unknown): value is TipTapDocument {
  return tipTapDocumentSchema.safeParse(value).success;
}

export function normalizeTipTapDocument(value: unknown): TipTapDocument {
  const parsed = tipTapDocumentSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }

  return tipTapDocumentSchema.parse(EMPTY_TIPTAP_DOC);
}

export function serializeTipTapDocument(value: TipTapDocument): string {
  return JSON.stringify(value);
}
