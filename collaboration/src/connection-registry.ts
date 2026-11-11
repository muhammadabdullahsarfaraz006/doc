import type { DocumentAccessRole } from "./auth.js";

export type ManagedConnection = {
  readOnly: boolean;
  close: () => void;
};

export type RegisteredConnection = {
  connectionId: string;
  documentId: string;
  userId: string;
  role: DocumentAccessRole;
  connection: ManagedConnection;
};

/**
 * Tracks active document collaborations so permission changes can revoke
 * access without waiting for reconnect or debounced store.
 */
export class ConnectionRegistry {
  private readonly byDocument = new Map<
    string,
    Map<string, RegisteredConnection>
  >();

  private readonly byConnection = new Map<string, RegisteredConnection>();

  register(entry: RegisteredConnection): void {
    this.byConnection.set(entry.connectionId, entry);
    let docMap = this.byDocument.get(entry.documentId);
    if (!docMap) {
      docMap = new Map();
      this.byDocument.set(entry.documentId, docMap);
    }
    docMap.set(entry.connectionId, entry);
  }

  unregister(connectionId: string): void {
    const existing = this.byConnection.get(connectionId);
    if (!existing) {
      return;
    }
    this.byConnection.delete(connectionId);
    const docMap = this.byDocument.get(existing.documentId);
    if (!docMap) {
      return;
    }
    docMap.delete(connectionId);
    if (docMap.size === 0) {
      this.byDocument.delete(existing.documentId);
    }
  }

  get(connectionId: string): RegisteredConnection | undefined {
    return this.byConnection.get(connectionId);
  }

  updateRole(connectionId: string, role: DocumentAccessRole): void {
    const existing = this.byConnection.get(connectionId);
    if (!existing) {
      return;
    }
    existing.role = role;
    existing.connection.readOnly = role === "viewer";
  }

  listForDocument(documentId: string): RegisteredConnection[] {
    const docMap = this.byDocument.get(documentId);
    if (!docMap) {
      return [];
    }
    return Array.from(docMap.values());
  }

  listDocumentIds(): string[] {
    return Array.from(this.byDocument.keys());
  }

  disconnectUser(documentId: string, userId: string): void {
    const entries = this.listForDocument(documentId).filter(
      (entry) => entry.userId === userId,
    );
    for (const entry of entries) {
      try {
        entry.connection.close();
      } catch {
        // Connection may already be closed.
      }
      this.unregister(entry.connectionId);
    }
  }

  forceReadOnly(documentId: string, userId: string): void {
    for (const entry of this.listForDocument(documentId)) {
      if (entry.userId !== userId) {
        continue;
      }
      entry.role = "viewer";
      entry.connection.readOnly = true;
    }
  }
}

export const connectionRegistry = new ConnectionRegistry();
