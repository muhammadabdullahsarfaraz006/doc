import { HocuspocusProvider } from "@hocuspocus/provider";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import * as Y from "yjs";

import type { Database } from "@/types/database";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const collabUrl = process.env.NEXT_PUBLIC_COLLAB_WS_URL;

const canRun =
  Boolean(url) &&
  Boolean(anonKey) &&
  Boolean(secretKey) &&
  Boolean(collabUrl) &&
  !url?.includes("YOUR_PROJECT_REF");

function waitFor(
  predicate: () => boolean,
  timeoutMs = 10_000,
  intervalMs = 50,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error("Timed out waiting for condition"));
      }
    }, intervalMs);
  });
}

describe.skipIf(!canRun)("live collaboration websocket", () => {
  const admin = createClient<Database>(url!, secretKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const createdUserIds: string[] = [];
  const createdDocumentIds: string[] = [];
  const providers: HocuspocusProvider[] = [];

  afterAll(async () => {
    for (const provider of providers) {
      provider.destroy();
    }
    for (const documentId of createdDocumentIds) {
      await admin.from("documents").delete().eq("id", documentId);
    }
    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  async function createUser(label: string) {
    const email = `ajaia.collab.${label}.${Date.now()}@mailinator.com`;
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
    const { data: sessionData, error: signInError } =
      await client.auth.signInWithPassword({ email, password });
    expect(signInError).toBeNull();
    return {
      client,
      userId: data.user!.id,
      email,
      token: sessionData.session!.access_token,
    };
  }

  it("syncs edits between owner and editor and rejects unrelated users", async () => {
    const owner = await createUser("owner");
    const editor = await createUser("editor");
    const stranger = await createUser("stranger");

    const documentId = crypto.randomUUID();
    const { error: insertError } = await owner.client.from("documents").insert({
      id: documentId,
      title: "Live collab doc",
      owner_id: owner.userId,
      content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "start" }] }],
      },
    });
    expect(insertError).toBeNull();
    createdDocumentIds.push(documentId);

    const { error: shareError } = await owner.client.rpc(
      "share_document_by_email",
      {
        p_document_id: documentId,
        p_email: editor.email,
        p_role: "editor",
      },
    );
    expect(shareError).toBeNull();

    const ydocA = new Y.Doc();
    const ydocB = new Y.Doc();

    let aSynced = false;
    let bSynced = false;

    const providerA = new HocuspocusProvider({
      url: collabUrl!,
      name: documentId,
      document: ydocA,
      token: owner.token,
      onSynced: () => {
        aSynced = true;
      },
    });
    const providerB = new HocuspocusProvider({
      url: collabUrl!,
      name: documentId,
      document: ydocB,
      token: editor.token,
      onSynced: () => {
        bSynced = true;
      },
    });
    providers.push(providerA, providerB);

    await waitFor(() => aSynced && bSynced);

    const fragmentA = ydocA.getXmlFragment("default");
    // TipTap uses XmlFragment; for a simple sync proof also update a shared map.
    const mapA = ydocA.getMap<string>("test");
    mapA.set("note", `hello-from-owner-${Date.now()}`);

    await waitFor(() => ydocB.getMap<string>("test").get("note") === mapA.get("note"));

    expect(ydocB.getMap<string>("test").get("note")).toBe(mapA.get("note"));
    expect(fragmentA).toBeTruthy();

    let strangerRejected = false;
    const strangerDoc = new Y.Doc();
    const strangerProvider = new HocuspocusProvider({
      url: collabUrl!,
      name: documentId,
      document: strangerDoc,
      token: stranger.token,
      onAuthenticationFailed: () => {
        strangerRejected = true;
      },
    });
    providers.push(strangerProvider);

    await waitFor(() => strangerRejected, 8_000);

    let invalidRejected = false;
    const invalidProvider = new HocuspocusProvider({
      url: collabUrl!,
      name: documentId,
      document: new Y.Doc(),
      token: "not-a-valid-jwt",
      onAuthenticationFailed: () => {
        invalidRejected = true;
      },
    });
    providers.push(invalidProvider);
    await waitFor(() => invalidRejected, 8_000);
  }, 30_000);

  it("keeps viewer connections read-only at the protocol level", async () => {
    const owner = await createUser("owner-ro");
    const viewer = await createUser("viewer-ro");

    const documentId = crypto.randomUUID();
    const { error: insertError } = await owner.client.from("documents").insert({
      id: documentId,
      title: "Viewer collab doc",
      owner_id: owner.userId,
    });
    expect(insertError).toBeNull();
    createdDocumentIds.push(documentId);

    const { error: shareError } = await owner.client.rpc(
      "share_document_by_email",
      {
        p_document_id: documentId,
        p_email: viewer.email,
        p_role: "viewer",
      },
    );
    expect(shareError).toBeNull();

    const ownerDoc = new Y.Doc();
    const viewerDoc = new Y.Doc();
    let ownerSynced = false;
    let viewerSynced = false;

    const ownerProvider = new HocuspocusProvider({
      url: collabUrl!,
      name: documentId,
      document: ownerDoc,
      token: owner.token,
      onSynced: () => {
        ownerSynced = true;
      },
    });
    const viewerProvider = new HocuspocusProvider({
      url: collabUrl!,
      name: documentId,
      document: viewerDoc,
      token: viewer.token,
      onSynced: () => {
        viewerSynced = true;
      },
    });
    providers.push(ownerProvider, viewerProvider);

    await waitFor(() => ownerSynced && viewerSynced);

    ownerDoc.getMap<string>("test").set("fromOwner", "ok");
    await waitFor(
      () => viewerDoc.getMap<string>("test").get("fromOwner") === "ok",
    );

    viewerDoc.getMap<string>("test").set("fromViewer", "should-not-propagate");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(ownerDoc.getMap<string>("test").get("fromViewer")).toBeUndefined();
  }, 30_000);
});
