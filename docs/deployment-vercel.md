# Ajaia Workspace — Dual Vercel Deployment

Two independent Vercel projects:

1. **Ajaia Web** — Next.js App Router (repo root)
2. **Ajaia Collaboration** — Hocuspocus WebSocket Function (`collaboration/`)

## Architecture notes (investigated)

| Topic | Finding |
|-------|---------|
| WebSockets on Vercel | Supported on Fluid Compute (GA as of Oct 2026). Endpoint is a Vercel Function exporting a Node HTTP server with `ws` upgrade. |
| Pinning | A connection stays on the instance that accepted it. |
| Placement | Reconnects may land on a different instance. |
| Duration | Hobby max **300s**; Pro up to **800s** (extended 1800s beta). Every connection eventually closes — clients must reconnect. |
| Multi-instance Yjs | In-memory state is **not** shared. Use `@hocuspocus/extension-redis` so updates/awareness propagate. |
| Durable persistence | Remains Supabase `document_yjs_states` via `@hocuspocus/extension-database`. Redis must **not** replace it. |
| Permission revoke | Each instance runs a Supabase Realtime watcher + local connection registry. Revokes apply to sockets on that instance; other instances handle their own sockets the same way. |

### Limitation (do not ignore)

On **Hobby**, WebSocket sessions are capped at **5 minutes**. The browser `HocuspocusProvider` reconnects automatically and Yjs resyncs from peers + persisted state. Expect brief “Reconnecting…” UI; content must not duplicate (CRDT).

Cross-instance concurrent editing **requires** `REDIS_URL`. Without Redis, only single-instance behavior is reliable.

## Project 1 — Ajaia Web

Root directory: repository root.

### Environment variables

| Name | Scope |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public |
| `NEXT_PUBLIC_COLLAB_WS_URL` | Public — `wss://<collab-project>.vercel.app/api/collab` |

Do **not** set the service-role key on the web project.

### Deploy

```bash
npx vercel link --project ajaia-web --yes
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel env add NEXT_PUBLIC_COLLAB_WS_URL production
npx vercel --prod
```

## Project 2 — Ajaia Collaboration

Root directory: `collaboration/`.

Entrypoint: [`api/collab.ts`](../collaboration/api/collab.ts) (HTTP health + WebSocket upgrade). Local long-running mode remains `npm run collab` → `src/server.ts`.

### Environment variables

| Name | Required | Notes |
|------|----------|-------|
| `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` | Yes | Same project as web |
| `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` | Yes | Server-only |
| `COLLAB_ALLOWED_ORIGINS` | Yes | Exact web origin(s), comma-separated |
| `REDIS_URL` | Yes (production multi-instance) | Upstash / Vercel Marketplace Redis |
| `COLLAB_REQUIRE_REDIS` | Recommended `true` in prod | Fail closed without Redis |
| `COLLAB_INSTANCE_NAME` | Optional | Unique name per instance |

### Deploy

```bash
cd collaboration
npx vercel link --project ajaia-collaboration --yes
npx vercel env add SUPABASE_URL production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel env add COLLAB_ALLOWED_ORIGINS production
npx vercel env add REDIS_URL production
npx vercel env add COLLAB_REQUIRE_REDIS production   # value: true
npx vercel --prod
```

Health check: `https://<collab>.vercel.app/health`

WebSocket: `wss://<collab>.vercel.app/api/collab`

## Verification checklist

1. Both projects deploy successfully.
2. Web connects (`NEXT_PUBLIC_COLLAB_WS_URL`).
3. Two users edit the same document.
4. With Redis: clients on different instances still sync (force by reconnecting / waiting for maxDuration).
5. After reconnect, content matches (no lost/duplicated CRDT state).
6. Viewer remains read-only.
7. Removing a collaborator disconnects / revokes write.
8. Comments + suggestions still work (Supabase path).
9. Restart / redeploy collab; Yjs state reloads from Postgres.

## Redis dependency

**Required for production multi-instance on Vercel.** Sync only — not durable storage.
