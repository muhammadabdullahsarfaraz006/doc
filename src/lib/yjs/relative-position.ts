import * as Y from "yjs";

import {
  decodeByteaValue,
  uint8ArrayToHexBytea,
} from "@/lib/yjs/bytea";

/**
 * BYTEA wire format (must match Phase 4B.1 / migration contract):
 *   Uint8Array ↔ '\\x' + hex for PostgREST/Supabase payloads.
 */
export function encodeByteaParam(bytes: Uint8Array): string {
  return uint8ArrayToHexBytea(bytes);
}

export function decodeByteaParam(value: unknown): Uint8Array | null {
  return decodeByteaValue(value);
}

export function relativePositionToBytea(rel: Y.RelativePosition): string {
  return encodeByteaParam(Y.encodeRelativePosition(rel));
}

export function byteaToRelativePosition(
  value: unknown,
): Y.RelativePosition | null {
  const bytes = decodeByteaParam(value);
  if (!bytes || bytes.byteLength === 0) {
    return null;
  }
  try {
    return Y.decodeRelativePosition(bytes);
  } catch {
    return null;
  }
}

type RelativePositionType = Parameters<
  typeof Y.createRelativePositionFromTypeIndex
>[0];

export function createAnchorPairFromIndexes(
  type: RelativePositionType,
  startIndex: number,
  endIndex: number,
): { start: string; end: string } {
  const startRel = Y.createRelativePositionFromTypeIndex(type, startIndex, -1);
  const endRel = Y.createRelativePositionFromTypeIndex(type, endIndex, 0);
  return {
    start: relativePositionToBytea(startRel),
    end: relativePositionToBytea(endRel),
  };
}

export type ResolvedAnchorRange = {
  index: number;
  length: number;
};

/**
 * Resolve stored relative positions against the live Y.Doc.
 * Returns null when either endpoint cannot be resolved (orphan / conflict).
 */
export function resolveAnchorRange(
  ydoc: Y.Doc,
  startBytea: unknown,
  endBytea: unknown,
  field = "default",
): ResolvedAnchorRange | null {
  const startRel = byteaToRelativePosition(startBytea);
  const endRel = byteaToRelativePosition(endBytea);
  if (!startRel || !endRel) {
    return null;
  }

  let startAbs: Y.AbsolutePosition | null = null;
  let endAbs: Y.AbsolutePosition | null = null;
  try {
    startAbs = Y.createAbsolutePositionFromRelativePosition(startRel, ydoc);
    endAbs = Y.createAbsolutePositionFromRelativePosition(endRel, ydoc);
  } catch {
    return null;
  }
  if (!startAbs || !endAbs) {
    return null;
  }

  const expected = ydoc.getXmlFragment(field);
  if (startAbs.type !== expected || endAbs.type !== expected) {
    return null;
  }

  const from = Math.min(startAbs.index, endAbs.index);
  const to = Math.max(startAbs.index, endAbs.index);
  return { index: from, length: to - from };
}

export const SUGGESTION_APPS_MAP = "__ajaia_suggestion_apps";

export function getSuggestionApplicationMarker(
  ydoc: Y.Doc,
  suggestionId: string,
): string | undefined {
  const map = ydoc.getMap<string>(SUGGESTION_APPS_MAP);
  const value = map.get(suggestionId);
  return typeof value === "string" ? value : undefined;
}

export function setSuggestionApplicationMarker(
  ydoc: Y.Doc,
  suggestionId: string,
  applicationId: string,
): void {
  ydoc.getMap<string>(SUGGESTION_APPS_MAP).set(suggestionId, applicationId);
}
