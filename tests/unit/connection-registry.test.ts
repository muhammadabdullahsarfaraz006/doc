import { describe, expect, it, vi } from "vitest";

import { ConnectionRegistry } from "../../collaboration/src/connection-registry";

describe("ConnectionRegistry", () => {
  it("registers and lists connections by document", () => {
    const registry = new ConnectionRegistry();
    const close = vi.fn();
    registry.register({
      connectionId: "c1",
      documentId: "doc-1",
      userId: "u1",
      role: "editor",
      connection: { readOnly: false, close },
    });

    expect(registry.listForDocument("doc-1")).toHaveLength(1);
    expect(registry.listDocumentIds()).toEqual(["doc-1"]);
  });

  it("disconnects a revoked user and closes their socket", () => {
    const registry = new ConnectionRegistry();
    const closeA = vi.fn();
    const closeB = vi.fn();
    registry.register({
      connectionId: "c1",
      documentId: "doc-1",
      userId: "u1",
      role: "editor",
      connection: { readOnly: false, close: closeA },
    });
    registry.register({
      connectionId: "c2",
      documentId: "doc-1",
      userId: "u2",
      role: "viewer",
      connection: { readOnly: true, close: closeB },
    });

    registry.disconnectUser("doc-1", "u1");

    expect(closeA).toHaveBeenCalledTimes(1);
    expect(closeB).not.toHaveBeenCalled();
    expect(registry.listForDocument("doc-1")).toHaveLength(1);
    expect(registry.listForDocument("doc-1")[0]?.userId).toBe("u2");
  });

  it("forces read-only on role downgrade", () => {
    const registry = new ConnectionRegistry();
    const connection = { readOnly: false, close: vi.fn() };
    registry.register({
      connectionId: "c1",
      documentId: "doc-1",
      userId: "u1",
      role: "editor",
      connection,
    });

    registry.forceReadOnly("doc-1", "u1");

    expect(connection.readOnly).toBe(true);
    expect(registry.get("c1")?.role).toBe("viewer");
  });
});
