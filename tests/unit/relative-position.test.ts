import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  createAnchorPairFromIndexes,
  getSuggestionApplicationMarker,
  resolveAnchorRange,
  setSuggestionApplicationMarker,
  SUGGESTION_APPS_MAP,
} from "@/lib/yjs/relative-position";
import {
  hexByteaToUint8Array,
  uint8ArrayToHexBytea,
} from "@/lib/yjs/bytea";

describe("BYTEA helpers", () => {
  it("round-trips Uint8Array through \\x hex", () => {
    const bytes = new Uint8Array([0, 1, 255, 16]);
    const encoded = uint8ArrayToHexBytea(bytes);
    expect(encoded.startsWith("\\x")).toBe(true);
    expect(hexByteaToUint8Array(encoded)).toEqual(bytes);
  });
});

describe("Yjs relative-position anchors", () => {
  it("encodes and resolves a stable range across concurrent edits outside the span", () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("default");
    const text = new Y.XmlText();
    fragment.insert(0, [text]);
    text.insert(0, "Hello world");

    const anchors = createAnchorPairFromIndexes(fragment, 0, 1);
    const before = resolveAnchorRange(doc, anchors.start, anchors.end);
    expect(before).toEqual({ index: 0, length: 1 });

    // Edit after the anchored region via a second client update.
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
    const remoteText = remote.getXmlFragment("default").get(0) as Y.XmlText;
    remoteText.insert(remoteText.length, "!");
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote));

    const after = resolveAnchorRange(doc, anchors.start, anchors.end);
    expect(after).toEqual({ index: 0, length: 1 });
  });

  it("returns null for invalid BYTEA or the wrong fragment field", () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("default");
    const text = new Y.XmlText();
    fragment.insert(0, [text]);
    text.insert(0, "abc");

    const anchors = createAnchorPairFromIndexes(fragment, 0, 1);
    expect(resolveAnchorRange(doc, "\\xff00", anchors.end)).toBeNull();
    expect(
      resolveAnchorRange(doc, anchors.start, anchors.end, "other-field"),
    ).toBeNull();
  });
});

describe("suggestion application markers", () => {
  it("stores sticky application ids in the shared Y.Map", () => {
    const doc = new Y.Doc();
    const suggestionId = crypto.randomUUID();
    const applicationId = crypto.randomUUID();

    expect(getSuggestionApplicationMarker(doc, suggestionId)).toBeUndefined();

    doc.transact(() => {
      setSuggestionApplicationMarker(doc, suggestionId, applicationId);
    });

    expect(getSuggestionApplicationMarker(doc, suggestionId)).toBe(
      applicationId,
    );
    expect(doc.getMap(SUGGESTION_APPS_MAP).get(suggestionId)).toBe(
      applicationId,
    );
  });
});
