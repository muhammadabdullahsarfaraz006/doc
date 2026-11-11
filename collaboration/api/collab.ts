/**
 * Vercel Function WebSocket entrypoint for Ajaia Collaboration.
 *
 * Exports a Node HTTP server with an attached `ws` upgrade handler.
 * Vercel Fluid Compute pins each connection to one instance for its lifetime;
 * connections close at maxDuration (Hobby 300s / Pro up to 800s+). Clients
 * must reconnect (HocuspocusProvider does this automatically).
 *
 * Cross-instance Yjs sync requires REDIS_URL + @hocuspocus/extension-redis.
 * Durable document state remains in Supabase `document_yjs_states`.
 */
import { Hocuspocus } from "@hocuspocus/server";
import http from "node:http";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";

import { collabEnv } from "../src/env.js";
import {
  createHocuspocusConfiguration,
  ensurePermissionWatcher,
  originAllowed,
} from "../src/hocuspocus-app.js";

ensurePermissionWatcher();

const hocuspocus = new Hocuspocus(createHocuspocusConfiguration());

const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/api/collab/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        service: "ajaia-collaboration",
        redis: Boolean(collabEnv.redisUrl),
        documents: hocuspocus.getDocumentsCount(),
        connections: hocuspocus.getConnectionsCount(),
      }),
    );
    return;
  }

  res.writeHead(200, { "content-type": "text/plain" });
  res.end("Ajaia collaboration WebSocket endpoint. Connect via wss://");
});

const wss = new WebSocketServer({ noServer: true });

server.on(
  "upgrade",
  (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!originAllowed(request)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      // Hocuspocus accepts Node IncomingMessage as the request bag for hooks.
      hocuspocus.handleConnection(ws, request as never);
    });
  },
);

export default server;
