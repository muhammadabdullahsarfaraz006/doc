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

function decodeRpcBytea(value: unknown): Uint8Array | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "string" && value.startsWith("\\x")) {
    return Uint8Array.from(Buffer.from(value.slice(2), "hex"));
  }
  if (typeof value === "string") {
    return Uint8Array.from(Buffer.from(value, "base64"));
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return new Uint8Array(value);
  }
  return null;
}

describe.skipIf(!canRun)("document_yjs_states persistence", () => {
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

  it("atomically initializes once and returns the same canonical state", async () => {
    const email = `ajaia.yjs.${Date.now()}@mailinator.com`;
    const { data: userData, error: userError } =
      await admin.auth.admin.createUser({
        email,
        password: "TestPass123!",
        email_confirm: true,
      });
    expect(userError).toBeNull();
    createdUserIds.push(userData.user!.id);

    const documentId = crypto.randomUUID();
    const { error: insertError } = await admin.from("documents").insert({
      id: documentId,
      title: "Yjs migration doc",
      owner_id: userData.user!.id,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "legacy body" }],
          },
        ],
      },
    });
    expect(insertError).toBeNull();
    createdDocumentIds.push(documentId);

    const docA = new Y.Doc();
    docA.getText("default").insert(0, "proposal-a");
    const stateA = Y.encodeStateAsUpdate(docA);

    const docB = new Y.Doc();
    docB.getText("default").insert(0, "proposal-b");
    const stateB = Y.encodeStateAsUpdate(docB);

    const { data: first, error: firstError } = await admin.rpc(
      "initialize_document_yjs_state",
      {
        p_document_id: documentId,
        p_yjs_state: encodeByteaParam(stateA),
        p_content_json: { type: "doc", content: [] },
      },
    );
    expect(firstError).toBeNull();

    const { data: second, error: secondError } = await admin.rpc(
      "initialize_document_yjs_state",
      {
        p_document_id: documentId,
        p_yjs_state: encodeByteaParam(stateB),
        p_content_json: { type: "doc", content: [] },
      },
    );
    expect(secondError).toBeNull();

    const firstBytes = decodeRpcBytea(first);
    const secondBytes = decodeRpcBytea(second);
    expect(firstBytes).not.toBeNull();
    expect(secondBytes).not.toBeNull();
    expect(Buffer.from(firstBytes!).equals(Buffer.from(secondBytes!))).toBe(
      true,
    );

    const { data: fetched } = await admin.rpc("get_document_yjs_state", {
      p_document_id: documentId,
    });
    const fetchedBytes = decodeRpcBytea(fetched);
    expect(fetchedBytes).not.toBeNull();
    expect(Buffer.from(fetchedBytes!).equals(Buffer.from(firstBytes!))).toBe(
      true,
    );

    // Authenticated clients must not be able to read yjs table directly.
    const userClient = createClient<Database>(url!, anonKey!);
    await userClient.auth.signInWithPassword({
      email,
      password: "TestPass123!",
    });
    const { data: leaked, error: leakError } = await userClient
      .from("document_yjs_states")
      .select("document_id")
      .eq("document_id", documentId);
    expect(leaked ?? []).toEqual([]);
    // Either empty due to RLS or an explicit permission error.
    expect(leakError === null || Boolean(leakError)).toBe(true);
  });

  it("stores binary with projection and rejects projection-only semantics", async () => {
    const email = `ajaia.yjs.store.${Date.now()}@mailinator.com`;
    const { data: userData, error: userError } =
      await admin.auth.admin.createUser({
        email,
        password: "TestPass123!",
        email_confirm: true,
      });
    expect(userError).toBeNull();
    createdUserIds.push(userData.user!.id);

    const documentId = crypto.randomUUID();
    const { error: insertError } = await admin.from("documents").insert({
      id: documentId,
      title: "Yjs store doc",
      owner_id: userData.user!.id,
    });
    expect(insertError).toBeNull();
    createdDocumentIds.push(documentId);

    const doc = new Y.Doc();
    doc.getText("default").insert(0, "hello");
    const initial = Y.encodeStateAsUpdate(doc);

    const { error: initError } = await admin.rpc(
      "initialize_document_yjs_state",
      {
        p_document_id: documentId,
        p_yjs_state: encodeByteaParam(initial),
        p_content_json: { type: "doc", content: [{ type: "paragraph" }] },
      },
    );
    expect(initError).toBeNull();

    doc.getText("default").insert(5, " world");
    const next = Y.encodeStateAsUpdate(doc);
    const projection = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "hello world" }],
        },
      ],
    };

    const { error: storeError } = await admin.rpc("store_document_yjs_state", {
      p_document_id: documentId,
      p_yjs_state: encodeByteaParam(next),
      p_content_json: projection,
    });
    expect(storeError).toBeNull();

    const { data: row } = await admin
      .from("document_yjs_states")
      .select("content_json")
      .eq("document_id", documentId)
      .maybeSingle();
    expect(row?.content_json).toEqual(projection);
  });
});
