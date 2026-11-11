import { TiptapTransformer } from "@hocuspocus/transformer";
import * as Y from "yjs";

import { collabTiptapExtensions, YJS_FIELD } from "./schema.js";
import { getAdminClient } from "./supabase.js";

function decodeRpcBytea(value: unknown): Uint8Array | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Uint8Array) {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return new Uint8Array(value);
  }

  if (typeof value === "string") {
    // PostgREST may return hex ("\\x...") or base64 depending on config.
    if (value.startsWith("\\x")) {
      return Uint8Array.from(Buffer.from(value.slice(2), "hex"));
    }
    return Uint8Array.from(Buffer.from(value, "base64"));
  }

  if (Array.isArray(value)) {
    return Uint8Array.from(value as number[]);
  }

  throw new Error("Unexpected yjs_state encoding from database");
}

function encodeByteaParam(state: Uint8Array): string {
  return `\\x${Buffer.from(state).toString("hex")}`;
}

export async function fetchDocumentYjsState(
  documentId: string,
): Promise<Uint8Array | null> {
  const admin = getAdminClient();
  const { data, error } = await admin.rpc("get_document_yjs_state", {
    p_document_id: documentId,
  });

  if (error) {
    throw new Error(`Failed to load Yjs state: ${error.message}`);
  }

  return decodeRpcBytea(data);
}

export async function loadLegacyTipTapJson(
  documentId: string,
): Promise<Record<string, unknown>> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("documents")
    .select("content")
    .eq("id", documentId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Failed to load legacy document content");
  }

  const content = data.content;
  if (
    content &&
    typeof content === "object" &&
    !Array.isArray(content) &&
    (content as { type?: unknown }).type === "doc"
  ) {
    return content as Record<string, unknown>;
  }

  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}

export function tipTapJsonToYjsUpdate(
  json: Record<string, unknown>,
): Uint8Array {
  const ydoc = TiptapTransformer.toYdoc(
    json,
    YJS_FIELD,
    collabTiptapExtensions,
  );
  return Y.encodeStateAsUpdate(ydoc);
}

export function yDocToTipTapJson(document: Y.Doc): Record<string, unknown> {
  const json = TiptapTransformer.fromYdoc(document, YJS_FIELD);
  if (json && typeof json === "object" && !Array.isArray(json)) {
    return json as Record<string, unknown>;
  }
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}

/**
 * Atomically initialize Yjs state from a proposed update (typically converted
 * legacy JSON). Always returns the canonical stored bytes.
 */
export async function initializeDocumentYjsState(
  documentId: string,
  proposedState: Uint8Array,
  contentJson: Record<string, unknown> | null,
): Promise<Uint8Array> {
  const admin = getAdminClient();
  const { data, error } = await admin.rpc("initialize_document_yjs_state", {
    p_document_id: documentId,
    p_yjs_state: encodeByteaParam(proposedState),
    p_content_json: contentJson,
  });

  if (error) {
    throw new Error(`Failed to initialize Yjs state: ${error.message}`);
  }

  const canonical = decodeRpcBytea(data);
  if (!canonical) {
    throw new Error("Initialize returned empty Yjs state");
  }

  return canonical;
}

export async function storeDocumentYjsState(
  documentId: string,
  state: Uint8Array,
  contentJson: Record<string, unknown> | null,
): Promise<void> {
  const admin = getAdminClient();
  const { error } = await admin.rpc("store_document_yjs_state", {
    p_document_id: documentId,
    p_yjs_state: encodeByteaParam(state),
    p_content_json: contentJson,
  });

  if (error) {
    throw new Error(`Failed to store Yjs state: ${error.message}`);
  }
}

export async function fetchOrMigrateDocumentState(
  documentId: string,
): Promise<Uint8Array> {
  const existing = await fetchDocumentYjsState(documentId);
  if (existing) {
    return existing;
  }

  const legacyJson = await loadLegacyTipTapJson(documentId);
  const proposed = tipTapJsonToYjsUpdate(legacyJson);
  return initializeDocumentYjsState(documentId, proposed, legacyJson);
}
