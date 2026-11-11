# Ajaia Workspace

Lightweight collaborative document editor inspired by Google Docs.

Authenticated users can create and edit documents, collaborate in realtime, and share with registered users as Editor or Viewer.

## Status

**Phase 5 complete:** Google Docs–style advanced formatting (fonts, colors, paragraph layout, links, tables) on the shared TipTap/Yjs schema.

Not yet implemented: version history (4B.3), unregistered email invites (4B.4).

## Technology stack

- Next.js App Router, React, TypeScript (strict)
- Tailwind CSS + Radix primitives
- Supabase Auth, PostgreSQL, Row Level Security
- Tiptap rich-text editor + Yjs / Hocuspocus collaboration
- Zod validation
- Vitest (unit + live integration)

## Local setup

```bash
cp .env.example .env.local
# Fill Supabase keys, DIRECT_URL, SUPABASE_SECRET_KEY / SERVICE_ROLE_KEY
# Set NEXT_PUBLIC_COLLAB_WS_URL=ws://127.0.0.1:1234

npm install
npm --prefix collaboration install

# Apply migrations (including document_yjs_states + comments/suggestions)
npx supabase db push --db-url "$DIRECT_URL"
# or run the SQL in supabase/migrations/ against your project

# Terminal 1 — collaboration WebSocket service
npm run collab:dev

# Terminal 2 — Next.js app
npm run dev
```

Email confirmation stays enabled. Use confirmed demo accounts for review when signup email is rate-limited.

## Collaboration service deployment (two Vercel projects)

Default production target is **two independent Vercel projects**:

1. **Ajaia Web** (repo root) — Next.js
2. **Ajaia Collaboration** (`collaboration/`) — Hocuspocus via Vercel Fluid Compute WebSockets (`api/collab.ts`)

Required for multi-instance collab: **`REDIS_URL`** (`@hocuspocus/extension-redis`). Durable Yjs state stays in Supabase.

WebSocket sessions end at the function `maxDuration` (Hobby **300s**). The client reconnects automatically.

Full steps, env vars, and verification: [`docs/deployment-vercel.md`](docs/deployment-vercel.md).

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js development server |
| `npm run collab` / `collab:dev` | Collaboration WebSocket service |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (Next app) |
| `npm run typecheck:collab` | TypeScript (collaboration service) |
| `npm test` | Vitest |

## Known limitations

- Version history is not implemented yet (4B.3)
- No email invitation delivery for unregistered users (4B.4)
- Shared with Me shows a neutral owner label (profiles are not broadly readable)
- Collaboration requires the separate WebSocket service to be running
- Suggestion accept spans Yjs + Postgres; the Yjs application marker is the mutation truth
- Heavy structural table edits may orphan comment/suggestion anchors (existing orphan path)
- No print layout, headers/footers, or pagination
