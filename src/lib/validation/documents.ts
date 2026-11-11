import { z } from "zod";

export const documentTitleSchema = z
  .string()
  .trim()
  .min(1, "Title is required")
  .max(200, "Title must be at most 200 characters");

export const documentRoleSchema = z.enum(["editor", "viewer"]);

export const createDocumentSchema = z.object({
  title: documentTitleSchema.default("Untitled document"),
});

export const renameDocumentSchema = z.object({
  title: documentTitleSchema,
});

/**
 * Autosave payload for Phase 3.
 * Persist with a conditional update:
 *   .update({ content, revision: expectedRevision + 1 })
 *   .eq("id", id)
 *   .eq("revision", expectedRevision)
 * No returned row => conflict. The DB trigger only asserts revision += 1.
 */
export const autosaveDocumentSchema = z.object({
  content: z.unknown(),
  expectedRevision: z.number().int().positive(),
  title: documentTitleSchema.optional(),
});

export const shareDocumentSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email address")
    .transform((value) => value.toLowerCase()),
  role: documentRoleSchema,
});

export const shareDocumentByEmailSchema = shareDocumentSchema.extend({
  documentId: z.string().uuid("Invalid document id"),
});

export const updateCollaboratorRoleSchema = z.object({
  memberId: z.string().uuid("Invalid collaborator id"),
  role: documentRoleSchema,
});

export const removeCollaboratorSchema = z.object({
  memberId: z.string().uuid("Invalid collaborator id"),
});

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type RenameDocumentInput = z.infer<typeof renameDocumentSchema>;
export type AutosaveDocumentInput = z.infer<typeof autosaveDocumentSchema>;
export type ShareDocumentInput = z.infer<typeof shareDocumentSchema>;
export type ShareDocumentByEmailInput = z.infer<
  typeof shareDocumentByEmailSchema
>;
export type UpdateCollaboratorRoleInput = z.infer<
  typeof updateCollaboratorRoleSchema
>;
export type RemoveCollaboratorInput = z.infer<typeof removeCollaboratorSchema>;
