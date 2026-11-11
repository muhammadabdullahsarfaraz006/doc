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

describe.skipIf(!canRun)("documents RLS integration", () => {
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
    const email = `ajaia.${label}.${Date.now()}@mailinator.com`;
    const password = "TestPass123!";
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: label },
    });

    expect(error).toBeNull();
    expect(data.user?.id).toBeTruthy();
    createdUserIds.push(data.user!.id);

    const client = createClient<Database>(url!, anonKey!);
    const { data: sessionData, error: signInError } =
      await client.auth.signInWithPassword({ email, password });
    expect(signInError).toBeNull();
    expect(sessionData.session).toBeTruthy();

    return { client, userId: data.user!.id, email };
  }

  it("lets an authenticated owner create, list, rename, and delete a document", async () => {
    const owner = await createConfirmedUser("owner");
    const documentId = crypto.randomUUID();

    const { error: insertError } = await owner.client.from("documents").insert({
      id: documentId,
      title: "Untitled document",
      owner_id: owner.userId,
    });
    expect(insertError).toBeNull();
    createdDocumentIds.push(documentId);

    const { data: listed, error: listError } = await owner.client
      .from("documents")
      .select("id,title,revision")
      .eq("owner_id", owner.userId);
    expect(listError).toBeNull();
    expect(listed?.some((row) => row.id === documentId)).toBe(true);

    const { data: renamed, error: renameError } = await owner.client
      .from("documents")
      .update({ title: "Sprint notes", revision: 2 })
      .eq("id", documentId)
      .eq("revision", 1)
      .select("title,revision")
      .maybeSingle();
    expect(renameError).toBeNull();
    expect(renamed).toEqual({ title: "Sprint notes", revision: 2 });

    const { data: deleted, error: deleteError } = await owner.client
      .from("documents")
      .delete()
      .eq("id", documentId)
      .select("id")
      .maybeSingle();
    expect(deleteError).toBeNull();
    expect(deleted?.id).toBe(documentId);

    createdDocumentIds.splice(createdDocumentIds.indexOf(documentId), 1);
  });

  it("blocks unrelated users from reading another user's document", async () => {
    const owner = await createConfirmedUser("owner2");
    const other = await createConfirmedUser("other");
    const documentId = crypto.randomUUID();

    const { error: insertError } = await owner.client.from("documents").insert({
      id: documentId,
      title: "Private",
      owner_id: owner.userId,
    });
    expect(insertError).toBeNull();
    createdDocumentIds.push(documentId);

    const { data, error } = await other.client
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("prevents a non-owner from renaming via RLS/trigger", async () => {
    const owner = await createConfirmedUser("owner3");
    const other = await createConfirmedUser("intruder");
    const documentId = crypto.randomUUID();

    await owner.client.from("documents").insert({
      id: documentId,
      title: "Owned",
      owner_id: owner.userId,
    });
    createdDocumentIds.push(documentId);

    // Direct share as editor via admin bypass to simulate collaborator.
    const { error: memberError } = await admin.from("document_members").insert({
      document_id: documentId,
      user_id: other.userId,
      role: "editor",
    });
    expect(memberError).toBeNull();

    const { data, error } = await other.client
      .from("documents")
      .update({ title: "Hijacked", revision: 2 })
      .eq("id", documentId)
      .eq("revision", 1)
      .select("title")
      .maybeSingle();

    expect(data).toBeNull();
    expect(error?.message.toLowerCase()).toMatch(/owner|rename|policy|revision|conflict/);
  });
});
