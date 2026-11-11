import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import * as Y from "yjs";

import type { Database } from "@/types/database";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

const canRun =
  Boolean(url) &&
  Boolean(anonKey) &&
  Boolean(secretKey) &&
  !url?.includes("YOUR_PROJECT_REF");

function encodeByteaParam(state: Uint8Array): string {
  return `\\x${Buffer.from(state).toString("hex")}`;
}

function dummyAnchorPair(): { start: string; end: string } {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment("default");
  const text = new Y.XmlText();
  fragment.insert(0, [text]);
  text.insert(0, "sample");
  const start = Y.createRelativePositionFromTypeIndex(fragment, 0, -1);
  const end = Y.createRelativePositionFromTypeIndex(fragment, 1, 0);
  return {
    start: encodeByteaParam(Y.encodeRelativePosition(start)),
    end: encodeByteaParam(Y.encodeRelativePosition(end)),
  };
}

describe.skipIf(!canRun)("comments + suggestions RLS / accept protocol", () => {
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
    const email = `ajaia.comments.${label}.${Date.now()}@mailinator.com`;
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

  async function createDocument(ownerId: string) {
    const documentId = crypto.randomUUID();
    const { error } = await admin.from("documents").insert({
      id: documentId,
      title: "Comments doc",
      owner_id: ownerId,
    });
    expect(error).toBeNull();
    createdDocumentIds.push(documentId);
    return documentId;
  }

  it("allows owners/editors to comment and blocks viewers from writing", async () => {
    const owner = await createConfirmedUser("owner");
    const editor = await createConfirmedUser("editor");
    const viewer = await createConfirmedUser("viewer");
    const stranger = await createConfirmedUser("stranger");
    const documentId = await createDocument(owner.userId);
    const anchors = dummyAnchorPair();

    const { error: shareEditorError } = await admin
      .from("document_members")
      .insert({
        document_id: documentId,
        user_id: editor.userId,
        role: "editor",
      });
    expect(shareEditorError).toBeNull();

    const { error: shareViewerError } = await admin
      .from("document_members")
      .insert({
        document_id: documentId,
        user_id: viewer.userId,
        role: "viewer",
      });
    expect(shareViewerError).toBeNull();

    const { data: thread, error: threadError } = await owner.client
      .from("comment_threads")
      .insert({
        document_id: documentId,
        body: "Owner note",
        selected_text_snapshot: "sample",
        anchor_start: anchors.start,
        anchor_end: anchors.end,
      })
      .select("id,author_id,body,anchor_status")
      .single();
    expect(threadError).toBeNull();
    expect(thread?.author_id).toBe(owner.userId);
    expect(thread?.anchor_status).toBe("active");

    const { error: editorCommentError } = await editor.client
      .from("comment_threads")
      .insert({
        document_id: documentId,
        body: "Editor note",
        selected_text_snapshot: "sample",
        anchor_start: anchors.start,
        anchor_end: anchors.end,
      });
    expect(editorCommentError).toBeNull();

    const { error: viewerWriteError } = await viewer.client
      .from("comment_threads")
      .insert({
        document_id: documentId,
        body: "Viewer note",
        selected_text_snapshot: "sample",
        anchor_start: anchors.start,
        anchor_end: anchors.end,
      });
    expect(viewerWriteError).not.toBeNull();

    const { data: viewerRead } = await viewer.client
      .from("comment_threads")
      .select("id")
      .eq("document_id", documentId);
    expect((viewerRead ?? []).length).toBeGreaterThan(0);

    const { data: strangerRead } = await stranger.client
      .from("comment_threads")
      .select("id")
      .eq("document_id", documentId);
    expect(strangerRead ?? []).toEqual([]);
  });

  it("claims once, completes idempotently, and rejects after accept", async () => {
    const owner = await createConfirmedUser("sugg-owner");
    const documentId = await createDocument(owner.userId);
    const anchors = dummyAnchorPair();

    const { data: suggestion, error: createError } = await owner.client
      .from("document_suggestions")
      .insert({
        document_id: documentId,
        suggestion_type: "replacement",
        original_text: "sample",
        proposed_content: { text: "revised" },
        anchor_start: anchors.start,
        anchor_end: anchors.end,
      })
      .select("*")
      .single();
    expect(createError).toBeNull();
    expect(suggestion?.status).toBe("pending");

    const { data: claimRows, error: claimError } = await owner.client.rpc(
      "claim_document_suggestion_for_accept",
      { p_suggestion_id: suggestion!.id },
    );
    expect(claimError).toBeNull();
    const claimed = Array.isArray(claimRows) ? claimRows[0] : claimRows;
    expect(claimed?.status).toBe("applying");
    expect(claimed?.application_id).toBeTruthy();

    const applicationId = claimed!.application_id!;

    const { data: reclaimRows, error: reclaimError } = await owner.client.rpc(
      "claim_document_suggestion_for_accept",
      { p_suggestion_id: suggestion!.id },
    );
    expect(reclaimError).toBeNull();
    const reclaimed = Array.isArray(reclaimRows) ? reclaimRows[0] : reclaimRows;
    expect(reclaimed?.application_id).toBe(applicationId);

    const { data: completeRows, error: completeError } = await owner.client.rpc(
      "complete_document_suggestion_accept",
      {
        p_suggestion_id: suggestion!.id,
        p_application_id: applicationId,
      },
    );
    expect(completeError).toBeNull();
    const completed = Array.isArray(completeRows)
      ? completeRows[0]
      : completeRows;
    expect(completed?.status).toBe("accepted");

    const { data: completeAgain, error: completeAgainError } =
      await owner.client.rpc("complete_document_suggestion_accept", {
        p_suggestion_id: suggestion!.id,
        p_application_id: applicationId,
      });
    expect(completeAgainError).toBeNull();
    const again = Array.isArray(completeAgain)
      ? completeAgain[0]
      : completeAgain;
    expect(again?.status).toBe("accepted");

    const { error: rejectError } = await owner.client.rpc(
      "reject_document_suggestion",
      { p_suggestion_id: suggestion!.id },
    );
    expect(rejectError).not.toBeNull();
  });

  it("fails an applying claim into conflict and blocks a second concurrent claim", async () => {
    const owner = await createConfirmedUser("conflict-owner");
    const editor = await createConfirmedUser("conflict-editor");
    const documentId = await createDocument(owner.userId);
    const anchors = dummyAnchorPair();

    await admin.from("document_members").insert({
      document_id: documentId,
      user_id: editor.userId,
      role: "editor",
    });

    const { data: suggestion } = await owner.client
      .from("document_suggestions")
      .insert({
        document_id: documentId,
        suggestion_type: "deletion",
        original_text: "sample",
        proposed_content: {},
        anchor_start: anchors.start,
        anchor_end: anchors.end,
      })
      .select("*")
      .single();

    const { data: claimRows } = await owner.client.rpc(
      "claim_document_suggestion_for_accept",
      { p_suggestion_id: suggestion!.id },
    );
    const claimed = Array.isArray(claimRows) ? claimRows[0] : claimRows;
    const applicationId = claimed!.application_id!;

    const { error: secondClaimError } = await editor.client.rpc(
      "claim_document_suggestion_for_accept",
      { p_suggestion_id: suggestion!.id },
    );
    expect(secondClaimError).not.toBeNull();

    const { data: failRows, error: failError } = await owner.client.rpc(
      "fail_document_suggestion_accept",
      {
        p_suggestion_id: suggestion!.id,
        p_application_id: applicationId,
        p_conflict_reason: "Anchor text changed",
      },
    );
    expect(failError).toBeNull();
    const failed = Array.isArray(failRows) ? failRows[0] : failRows;
    expect(failed?.status).toBe("conflict");
    expect(failed?.conflict_reason).toBe("Anchor text changed");
  });
});
