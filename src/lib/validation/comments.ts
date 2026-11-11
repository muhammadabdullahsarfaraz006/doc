import { z } from "zod";

import { uuidSchema } from "@/lib/validation/ids";

const bodySchema = z.string().trim().min(1).max(10_000);
const selectedTextSchema = z.string().max(20_000);
const byteaHexSchema = z
  .string()
  .regex(/^\\x[0-9a-fA-F]+$/, "Invalid relative-position encoding");

export const createCommentThreadSchema = z.object({
  documentId: uuidSchema,
  body: bodySchema,
  selectedTextSnapshot: selectedTextSchema.default(""),
  anchorStart: byteaHexSchema,
  anchorEnd: byteaHexSchema,
});

export const updateCommentThreadBodySchema = z.object({
  threadId: uuidSchema,
  body: bodySchema,
});

export const threadIdSchema = z.object({
  threadId: uuidSchema,
});

export const createCommentReplySchema = z.object({
  threadId: uuidSchema,
  body: bodySchema,
});

export const updateCommentReplySchema = z.object({
  replyId: uuidSchema,
  body: bodySchema,
});

export const markCommentOrphanedSchema = z.object({
  threadId: uuidSchema,
});

export type CreateCommentThreadInput = z.infer<typeof createCommentThreadSchema>;
export type CreateCommentReplyInput = z.infer<typeof createCommentReplySchema>;
