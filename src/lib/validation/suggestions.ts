import { z } from "zod";

import { uuidSchema } from "@/lib/validation/ids";

const byteaHexSchema = z
  .string()
  .regex(/^\\x[0-9a-fA-F]+$/, "Invalid relative-position encoding");

const proposedContentSchema = z
  .object({
    text: z.string().max(50_000).optional(),
  })
  .strict();

export const createSuggestionSchema = z.object({
  documentId: uuidSchema,
  suggestionType: z.enum(["insertion", "deletion", "replacement"]),
  originalText: z.string().max(50_000).default(""),
  proposedContent: proposedContentSchema.default({}),
  anchorStart: byteaHexSchema,
  anchorEnd: byteaHexSchema,
});

export const suggestionIdSchema = z.object({
  suggestionId: uuidSchema,
});

export const completeSuggestionSchema = z.object({
  suggestionId: uuidSchema,
  applicationId: uuidSchema,
});

export const failSuggestionSchema = z.object({
  suggestionId: uuidSchema,
  applicationId: uuidSchema,
  conflictReason: z.string().trim().min(1).max(2000),
});

export type CreateSuggestionInput = z.infer<typeof createSuggestionSchema>;
