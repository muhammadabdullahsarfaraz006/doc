import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import type { Database } from "@/types/database";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

const canRun =
  Boolean(url) &&
  Boolean(anonKey) &&
  Boolean(secretKey) &&
  !url?.includes("YOUR_PROJECT_REF");

const sampleDoc = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Phase 3" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", marks: [{ type: "bold" }], text: "Bold" },
        { type: "text", text: " body" },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "One" }],
            },
          ],
        },
      ],
    },
  ],
};

describe.skipIf(!canRun)("document editor live persistence", () => {
  const admin = createClient<Database>(url!, secretKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const createdUserIds: string[] = [];
  const createdDocumentIds: string[] = [];

  afterAll(async () => {
    for (const documentId of createdDocumentIds) {
      await admin.from("documents").delete().eq("id", documentId);
    }
    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  async function createConfirmedUser(label: string) {
    const email = `ajaia.editor.${label}.${Date.now()}@mailinator.com`;
    const password = "TestPass123!";
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: label },
    });
    expect(error).toBeNull();
    createdUserIds.push(data.user!.id);

    const client = createClient<Database>(url!, anonKey!);
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password,
    });
    expect(signInError).toBeNull();
    return { client, userId: data.user!.id };
  }

  it("saves tip tap json and reloads formatting", async () => {
    const owner = await createConfirmedUser("owner");
    const documentId = crypto.randomUUID();

    const { error: insertError } = await owner.client.from("documents").insert({
      id: documentId,
      title: "Editor doc",
      owner_id: owner.userId,
    });
    expect(insertError).toBeNull();
    createdDocumentIds.push(documentId);

    const { data: saved, error: saveError } = await owner.client
      .from("documents")
      .update({ content: sampleDoc, revision: 2 })
      .eq("id", documentId)
      .eq("revision", 1)
      .select("content, revision")
      .maybeSingle();

    expect(saveError).toBeNull();
    expect(saved?.revision).toBe(2);
    expect(saved?.content).toMatchObject(sampleDoc);

    const { data: reloaded } = await owner.client
      .from("documents")
      .select("content, revision")
      .eq("id", documentId)
      .maybeSingle();

    expect(reloaded?.revision).toBe(2);
    expect(reloaded?.content).toMatchObject(sampleDoc);
  });

  it("detects revision conflicts between two writers", async () => {
    const owner = await createConfirmedUser("owner-conflict");
    const collaborator = await createConfirmedUser("editor-conflict");
    const documentId = crypto.randomUUID();

    await owner.client.from("documents").insert({
      id: documentId,
      title: "Conflict doc",
      owner_id: owner.userId,
    });
    createdDocumentIds.push(documentId);

    const { error: memberError } = await admin.from("document_members").insert({
      document_id: documentId,
      user_id: collaborator.userId,
      role: "editor",
    });
    expect(memberError).toBeNull();

    const { data: first } = await owner.client
      .from("documents")
      .update({
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "owner" }],
            },
          ],
        },
        revision: 2,
      })
      .eq("id", documentId)
      .eq("revision", 1)
      .select("revision")
      .maybeSingle();
    expect(first?.revision).toBe(2);

    const { data: second, error: secondError } = await collaborator.client
      .from("documents")
      .update({
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "stale" }],
            },
          ],
        },
        revision: 2,
      })
      .eq("id", documentId)
      .eq("revision", 1)
      .select("revision")
      .maybeSingle();

    expect(second).toBeNull();
    expect(secondError).toBeNull();

    const { data: current } = await owner.client
      .from("documents")
      .select("revision, content")
      .eq("id", documentId)
      .maybeSingle();

    expect(current?.revision).toBe(2);
    expect(current?.content).toMatchObject({
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "owner" }],
        },
      ],
    });
  });

  it("blocks viewers from updating content and editors from renaming", async () => {
    const owner = await createConfirmedUser("owner-roles");
    const editor = await createConfirmedUser("editor-roles");
    const viewer = await createConfirmedUser("viewer-roles");
    const documentId = crypto.randomUUID();

    await owner.client.from("documents").insert({
      id: documentId,
      title: "Roles doc",
      owner_id: owner.userId,
    });
    createdDocumentIds.push(documentId);

    await admin.from("document_members").insert([
      {
        document_id: documentId,
        user_id: editor.userId,
        role: "editor",
      },
      {
        document_id: documentId,
        user_id: viewer.userId,
        role: "viewer",
      },
    ]);

    const { data: viewerUpdate } = await viewer.client
      .from("documents")
      .update({
        content: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "nope" }] }],
        },
        revision: 2,
      })
      .eq("id", documentId)
      .eq("revision", 1)
      .select("id")
      .maybeSingle();
    expect(viewerUpdate).toBeNull();

    const { data: editorRename, error: renameError } = await editor.client
      .from("documents")
      .update({ title: "Hijacked", revision: 2 })
      .eq("id", documentId)
      .eq("revision", 1)
      .select("title")
      .maybeSingle();

    expect(editorRename).toBeNull();
    expect(
      renameError?.message.toLowerCase().includes("owner") ||
        renameError == null,
    ).toBe(true);

    const { data: still } = await owner.client
      .from("documents")
      .select("title, revision")
      .eq("id", documentId)
      .maybeSingle();
    expect(still?.title).toBe("Roles doc");
    expect(still?.revision).toBe(1);
  });

  it("blocks unauthorized users from reading document content", async () => {
    const owner = await createConfirmedUser("owner-private");
    const stranger = await createConfirmedUser("stranger");
    const documentId = crypto.randomUUID();

    await owner.client.from("documents").insert({
      id: documentId,
      title: "Secret",
      owner_id: owner.userId,
      content: sampleDoc,
    });
    createdDocumentIds.push(documentId);

    const { data } = await stranger.client
      .from("documents")
      .select("content, title")
      .eq("id", documentId)
      .maybeSingle();

    expect(data).toBeNull();
  });
});
