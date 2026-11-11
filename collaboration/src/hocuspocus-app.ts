import { Database } from "@hocuspocus/extension-database";
import { Redis } from "@hocuspocus/extension-redis";
import { randomUUID } from "node:crypto";
import * as Y from "yjs";

import {
  loadCollaboratorContext,
  roleIsWritable,
  type AuthenticatedCollaborator,
} from "./auth.js";
import { connectionRegistry } from "./connection-registry.js";
import { collabEnv } from "./env.js";
import {
  fetchOrMigrateDocumentState,
  storeDocumentYjsState,
  yDocToTipTapJson,
} from "./persistence.js";
import { startPermissionWatcher } from "./permission-watcher.js";

export type ConnectionContext = AuthenticatedCollaborator & {
  documentId: string;
};

type HeaderBag =
  | Headers
  | { get?: (name: string) => string | null | undefined }
  | Record<string, string | string[] | undefined>;

export function originAllowed(request: { headers: HeaderBag }): boolean {
  let origin: string | null | undefined;
  const headers = request.headers;
  if (headers && typeof (headers as Headers).get === "function") {
    origin = (headers as Headers).get("origin");
  } else if (headers && typeof headers === "object") {
    const raw = (headers as Record<string, string | string[] | undefined>)
      .origin;
    origin = Array.isArray(raw) ? raw[0] : raw;
  }

  if (!origin) {
    return true;
  }
  return collabEnv.allowedOrigins.includes(origin);
}

function createExtensions() {
  const extensions: Array<Database | Redis> = [
    new Database({
      fetch: async ({ documentName }) => {
        const state = await fetchOrMigrateDocumentState(documentName);
        return Buffer.from(state);
      },
      store: async ({ documentName, state, document }) => {
        const contentJson = yDocToTipTapJson(document as Y.Doc);
        await storeDocumentYjsState(
          documentName,
          new Uint8Array(state),
          contentJson,
        );
      },
    }),
  ];

  if (collabEnv.redisUrl) {
    // Use host/port/password from URL so we avoid ioredis duplicate-type issues
    // between the root package and extension-redis's nested ioredis.
    const parsed = new URL(collabEnv.redisUrl);
    extensions.push(
      new Redis({
        host: parsed.hostname,
        port: Number(parsed.port || 6379),
        options: {
          username: parsed.username || undefined,
          password: parsed.password || undefined,
          tls: parsed.protocol === "rediss:" ? {} : undefined,
          maxRetriesPerRequest: null,
        },
        identifier: `ajaia-${randomUUID()}`,
      }),
    );
  } else {
    console.warn(
      "[ajaia-collab] REDIS_URL not set — running single-instance mode. Cross-instance Yjs sync is disabled.",
    );
  }

  return extensions;
}

/**
 * Shared Hocuspocus configuration for local Server.listen() and Vercel
 * handleConnection() entrypoints.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createHocuspocusConfiguration(): any {
  return {
    name: collabEnv.instanceName,
    timeout: 30_000,
    debounce: 2_000,
    maxDebounce: 10_000,
    quiet: false,

    async onConnect({ request }: { request: { headers: HeaderBag } }) {
      if (!originAllowed(request)) {
        throw new Error("Origin not allowed");
      }
    },

    async onAuthenticate(data: {
      token: string;
      documentName: string;
      connectionConfig: { readOnly: boolean };
    }) {
      const collaborator = await loadCollaboratorContext(
        data.documentName,
        data.token,
      );
      data.connectionConfig.readOnly = !roleIsWritable(collaborator.role);
      const context: ConnectionContext = {
        ...collaborator,
        documentId: data.documentName,
      };
      return context;
    },

    async connected({
      socketId,
      documentName,
      connection,
      context,
    }: {
      socketId: string;
      documentName: string;
      connection: { readOnly: boolean; close: () => void };
      context: ConnectionContext | undefined;
    }) {
      if (!context) {
        return;
      }
      connection.readOnly = !roleIsWritable(context.role);
      connectionRegistry.register({
        connectionId: socketId,
        documentId: documentName,
        userId: context.userId,
        role: context.role,
        connection: {
          get readOnly() {
            return connection.readOnly;
          },
          set readOnly(value: boolean) {
            connection.readOnly = value;
          },
          close: () => {
            connection.close();
          },
        },
      });
    },

    async onDisconnect({ socketId }: { socketId: string }) {
      connectionRegistry.unregister(socketId);
    },

    async beforeHandleMessage({
      connection,
      context,
      socketId,
    }: {
      connection: { readOnly: boolean };
      context: ConnectionContext | undefined;
      socketId: string;
    }) {
      if (!context) {
        return;
      }
      const entry = connectionRegistry.get(socketId);
      const role = entry?.role ?? context.role;
      if (!roleIsWritable(role)) {
        connection.readOnly = true;
        if (entry) {
          entry.connection.readOnly = true;
        }
      }
    },

    extensions: createExtensions(),
  };
}

let watcherStarted = false;

export function ensurePermissionWatcher(): () => void {
  if (watcherStarted) {
    return () => undefined;
  }
  watcherStarted = true;
  return startPermissionWatcher();
}
