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

describe.skipIf(!canRun)("document sharing live RLS", () => {
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
    const email = `ajaia.share.${label}.${Date.now()}@mailinator.com`;
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
    return { client, userId: data.user!.id, email };
  }

  async function createOwnedDocument(
    owner: Awaited<ReturnType<typeof createConfirmedUser>>,
    title: string,
  ) {
    const documentId = crypto.randomUUID();
    const { error } = await owner.client.from("documents").insert({
      id: documentId,
      title,
      owner_id: owner.userId,
    });
    expect(error).toBeNull();
    createdDocumentIds.push(documentId);
    return documentId;
  }

  it("lets an owner share as editor and viewer, list, update, and remove", async () => {
    const owner = await createConfirmedUser("owner");
    const editorUser = await createConfirmedUser("editor");
    const viewerUser = await createConfirmedUser("viewer");
    const documentId = await createOwnedDocument(owner, "Shared doc");

    const { data: editorShare, error: editorShareError } = await owner.client.rpc(
      "share_document_by_email",
      {
        p_document_id: documentId,
        p_email: editorUser.email,
        p_role: "editor",
      },
    );
    expect(editorShareError).toBeNull();
    expect(editorShare?.[0]?.role).toBe("editor");

    const { data: viewerShare, error: viewerShareError } = await owner.client.rpc(
      "share_document_by_email",
      {
        p_document_id: documentId,
        p_email: viewerUser.email,
        p_role: "viewer",
      },
    );
    expect(viewerShareError).toBeNull();
    expect(viewerShare?.[0]?.role).toBe("viewer");

    const { data: listed } = await owner.client.rpc(
      "list_document_collaborators",
      { p_document_id: documentId },
    );
    expect(listed?.length).toBe(2);

    const editorMemberId = editorShare?.[0]?.member_id;
    expect(editorMemberId).toBeTruthy();

    const { data: updated } = await owner.client.rpc(
      "update_document_member_role",
      {
        p_member_id: editorMemberId!,
        p_role: "viewer",
      },
    );
    expect(updated?.[0]?.role).toBe("viewer");

    const { error: removeError } = await owner.client.rpc(
      "remove_document_member",
      { p_member_id: editorMemberId! },
    );
    expect(removeError).toBeNull();

    const { data: afterRemove } = await editorUser.client
      .from("documents")
      .select("id")
      .eq("id", documentId)
      .maybeSingle();
    expect(afterRemove).toBeNull();
  });

  it("rejects unregistered, self, and duplicate shares", async () => {
    const owner = await createConfirmedUser("owner2");
    const other = await createConfirmedUser("other2");
    const documentId = await createOwnedDocument(owner, "Validation doc");

    const { error: unregistered } = await owner.client.rpc(
      "share_document_by_email",
      {
        p_document_id: documentId,
        p_email: "nobody-registered-xyz@mailinator.com",
        p_role: "editor",
      },
    );
    expect(unregistered?.message.toLowerCase()).toContain("registered");

    const { error: selfShare } = await owner.client.rpc(
      "share_document_by_email",
      {
        p_document_id: documentId,
        p_email: owner.email,
        p_role: "editor",
      },
    );
    expect(selfShare?.message.toLowerCase()).toContain("yourself");

    await owner.client.rpc("share_document_by_email", {
      p_document_id: documentId,
      p_email: other.email,
      p_role: "viewer",
    });
    const { error: duplicate } = await owner.client.rpc(
      "share_document_by_email",
      {
        p_document_id: documentId,
        p_email: other.email,
        p_role: "editor",
      },
    );
    expect(duplicate?.message.toLowerCase()).toContain("already");
  });

  it("blocks editor/viewer from sharing and viewer from editing", async () => {
    const owner = await createConfirmedUser("owner3");
    const editor = await createConfirmedUser("editor3");
    const viewer = await createConfirmedUser("viewer3");
    const outsider = await createConfirmedUser("outsider3");
    const documentId = await createOwnedDocument(owner, "Permissions doc");

    await owner.client.rpc("share_document_by_email", {
      p_document_id: documentId,
      p_email: editor.email,
      p_role: "editor",
    });
    await owner.client.rpc("share_document_by_email", {
      p_document_id: documentId,
      p_email: viewer.email,
      p_role: "viewer",
    });

    const { error: editorShare } = await editor.client.rpc(
      "share_document_by_email",
      {
        p_document_id: documentId,
        p_email: outsider.email,
        p_role: "viewer",
      },
    );
    expect(editorShare?.message.toLowerCase()).toContain("owner");

    const { error: viewerShare } = await viewer.client.rpc(
      "share_document_by_email",
      {
        p_document_id: documentId,
        p_email: outsider.email,
        p_role: "viewer",
      },
    );
    expect(viewerShare?.message.toLowerCase()).toContain("owner");

    const { data: viewerEdit } = await viewer.client
      .from("documents")
      .update({
        content: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
        },
        revision: 2,
      })
      .eq("id", documentId)
      .eq("revision", 1)
      .select("id")
      .maybeSingle();
    expect(viewerEdit).toBeNull();

    const { data: outsiderRead } = await outsider.client
      .from("documents")
      .select("id")
      .eq("id", documentId)
      .maybeSingle();
    expect(outsiderRead).toBeNull();
  });

  it("shows membership docs only in shared queries and not owned docs", async () => {
    const owner = await createConfirmedUser("owner4");
    const member = await createConfirmedUser("member4");
    const ownedId = await createOwnedDocument(member, "Member owned");
    const sharedId = await createOwnedDocument(owner, "Owner shared");

    await owner.client.rpc("share_document_by_email", {
      p_document_id: sharedId,
      p_email: member.email,
      p_role: "editor",
    });

    const { data: memberships } = await member.client
      .from("document_members")
      .select("document_id, role")
      .eq("user_id", member.userId);

    const sharedMembershipIds = (memberships ?? []).map((row) => row.document_id);
    expect(sharedMembershipIds).toContain(sharedId);
    expect(sharedMembershipIds).not.toContain(ownedId);

    const { data: sharedDocs } = await member.client
      .from("documents")
      .select("id, owner_id")
      .in("id", sharedMembershipIds)
      .neq("owner_id", member.userId);

    expect(sharedDocs?.some((doc) => doc.id === sharedId)).toBe(true);
    expect(sharedDocs?.some((doc) => doc.id === ownedId)).toBe(false);

    const { data: collaborators } = await owner.client.rpc(
      "list_document_collaborators",
      { p_document_id: sharedId },
    );
    const memberRow = collaborators?.find(
      (row) => row.user_id === member.userId,
    );
    expect(memberRow?.member_id).toBeTruthy();

    const { data: afterRoleChange } = await owner.client.rpc(
      "update_document_member_role",
      {
        p_member_id: memberRow!.member_id,
        p_role: "viewer",
      },
    );
    expect(afterRoleChange?.[0]?.role).toBe("viewer");

    const { data: memberReload } = await member.client
      .from("document_members")
      .select("role")
      .eq("document_id", sharedId)
      .eq("user_id", member.userId)
      .maybeSingle();
    expect(memberReload?.role).toBe("viewer");
  });
});
