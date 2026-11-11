import { Server } from "@hocuspocus/server";

import { collabEnv } from "./env.js";
import {
  createHocuspocusConfiguration,
  ensurePermissionWatcher,
} from "./hocuspocus-app.js";

/**
 * Local long-running entrypoint (`npm run collab`).
 * Production on Vercel uses `api/collab.ts` + handleConnection instead of listen().
 */
const stopWatcher = ensurePermissionWatcher();

const server = new Server({
  ...createHocuspocusConfiguration(),
  port: collabEnv.port,
});

server
  .listen()
  .then(() => {
    console.log(
      `Ajaia collaboration server listening on ws://127.0.0.1:${collabEnv.port}`,
    );
    console.log(
      `Allowed origins: ${collabEnv.allowedOrigins.join(", ") || "(none)"}`,
    );
    console.log(
      `Redis cross-instance sync: ${
        collabEnv.redisUrl ? "enabled" : "disabled (single-instance)"
      }`,
    );
  })
  .catch((error: unknown) => {
    console.error("Failed to start collaboration server", error);
    process.exit(1);
  });

async function shutdown() {
  stopWatcher();
  await server.destroy();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
