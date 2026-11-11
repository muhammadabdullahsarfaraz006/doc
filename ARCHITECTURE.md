# Architecture

## Overview

Ajaia Workspace is a Next.js modular monolith plus a separately deployable Hocuspocus collaboration service. The browser talks to Next.js (App Router), to Supabase using the anon/publishable key under Row Level Security, and to the collaboration WebSocket for live editing. Privileged secret keys never ship to the client.

```
Browser → Next.js (SSR/RSC + server actions)
       ↘ Supabase Auth + Postgres (RLS)
       ↘ Hocuspocus collaboration service (JWT + service-role persistence)
              ↘ Supabase (document_yjs_states, membership checks)
```

## Feature modules

| Feature | Responsibility | Phase |
|---------|----------------|-------|
| Auth | Registration, login, logout, session cookies | 2 |
| Documents | Create, list, rename, delete, open | 2 |
| Editor | Tiptap editing, advanced formatting | 3 / 4B.1 / 5 |
| Sharing | Owner-managed collaborators via RPC | 4A |
| Collaboration | Yjs live editing, presence, cursors | 4B.1 |
| Comments | Persistent threads, replies, orphan anchors | 4B.2 |
| Suggestions | Suggestion mode + accept/reject with claim protocol | 4B.2 |
| Import | TXT/Markdown → Tiptap JSON | Done |

## Authentication (Phase 2)

- Email/password via Supabase Auth
- Cookie sessions via `@supabase/ssr`
- Email confirmation remains enabled; demo accounts are pre-confirmed

## Document editor (Phase 3 / 4B.1)

When `NEXT_PUBLIC_COLLAB_WS_URL` is set:

- Authoritative body state is **Yjs binary** in `document_yjs_states.yjs_state`
- `documents.content` JSON is legacy migration source only (one-time convert)
- `content_json` on the Yjs table is a derived, non-authoritative projection
- Phase 3 revision-conditioned **content** autosave is disabled
- Title rename still uses `documents.revision` guards

When the collab URL is unset, the legacy Phase 3 JSON autosave path remains available for local fallback.

## File import

- Dashboard **Import file** creates a new owned document from `.txt` / `.md` (max 2 MB)
- Editor **Import** replaces the open document body (Owner/Editor only); collaborative mode syncs via Yjs
- Server validates extension, MIME, size, UTF-8 text, and converts to TipTap JSON
- Markdown subset: headings H1–H3, paragraphs, bullet/ordered lists, bold, italic, safe links
- Unsupported Markdown (e.g. code fences) is imported as plain text; `javascript:` links are rejected
- No server-side execution of uploaded content

## Advanced formatting (Phase 5)

Shared TipTap schema (must match across clients):

- App: [`src/features/editor/extensions.ts`](src/features/editor/extensions.ts)
- Collab transformer: [`collaboration/src/schema.ts`](collaboration/src/schema.ts)

Official TipTap 3.33.1 extensions: TextStyle / FontFamily / FontSize / Color, Highlight, TextAlign, Superscript, Subscript, Link, TableKit. StarterKit covers bold/italic/underline/strike/lists/headings/horizontal rule.

Custom `ParagraphLayout` attributes on paragraph/heading:

- `indent` (0–8 × 24px)
- `firstLineIndent` (including hanging via negative values)
- `lineHeight`, `spaceBefore`, `spaceAfter`

Formatting is stored in the document schema and syncs through Yjs. No separate formatting persistence table. Phase 3 content autosave remains disabled when collaborative editing is active. Viewers stay read-only.

## Sharing (Phase 4A)

Application calls existing SECURITY DEFINER RPCs with the authenticated session:

- `share_document_by_email`
- `list_document_collaborators`
- `update_document_member_role`
- `remove_document_member`

UI:

- Owner-only Share dialog on the document editor
- Shared with Me lists membership documents (excludes owned docs)
- Owner identity on shared cards uses a neutral “Shared with you” label because `profiles` SELECT is own-row only

## Collaboration service (Phase 4B.1)

Package: [`collaboration/`](collaboration/)

- Hocuspocus + `@hocuspocus/extension-database` + `@hocuspocus/transformer`
- Authenticates every connection with the Supabase user JWT (`auth.getUser`)
- Resolves Owner / Editor / Viewer from Postgres (never trusts client-supplied roles)
- Sets `connectionConfig.readOnly` for viewers; also enforces via `beforeHandleMessage` and connection registry
- Tracks active connections; Realtime + periodic recheck disconnects revoked users and forces read-only on downgrade
- Persists via service-role RPCs only:
  - `get_document_yjs_state`
  - `initialize_document_yjs_state` (atomic first-time JSON→Yjs)
  - `store_document_yjs_state`
- No browser policies/grants on `document_yjs_states`

### Deployment (two Vercel projects)

1. **Ajaia Web** — Next.js at repo root
2. **Ajaia Collaboration** — `collaboration/api/collab.ts` exports a Node HTTP + `ws` upgrade server for Vercel Fluid Compute WebSockets

Cross-instance Yjs/awareness sync uses `@hocuspocus/extension-redis` (`REDIS_URL`). Durable persistence remains Supabase `document_yjs_states`. Local registry + Supabase Realtime still revoke permissions per instance.

Connections close at Vercel function `maxDuration` (Hobby 300s / Pro up to 800s+); `HocuspocusProvider` reconnects and Yjs resyncs.

See [`docs/deployment-vercel.md`](docs/deployment-vercel.md).

Local:

```bash
npm run collab:dev   # terminal 1
npm run dev          # terminal 2
```

## Comments and suggestions (Phase 4B.2)

- Tables: `comment_threads`, `comment_replies`, `document_suggestions`
- Anchors are Yjs relative positions stored as BYTEA (`\\x` hex wire format, same as Yjs state)
- Owner/Editor: create/reply/resolve comments and create/review suggestions; Viewer: read-only
- Suggestion accept is not a single ACID cross-system transaction:
  1. `claim_document_suggestion_for_accept` → sticky `application_id`, status `applying`
  2. Client applies the edit and writes Y.Map `__ajaia_suggestion_apps[suggestion_id]=application_id`
  3. `complete_document_suggestion_accept` (or `fail_…` → `conflict`)
  4. Resume with same `application_id` if marker already present; `release_stale_suggestion_claim` only when lease expired and marker absent
- UI: comments side panel + Suggesting mode on the collaborative editor; Realtime refreshes lists

## Database

- Phase 1: profiles, documents (`revision`), document_members, RLS, sharing RPCs
- Phase 4B.1: `document_yjs_states` + service-role Yjs RPCs (additive migration `20261111183000_document_yjs_states.sql`)
- Phase 4B.2: comments/suggestions tables + accept RPCs (additive migration `20261111190000_comments_suggestions.sql`)

## Tradeoffs

| Decision | Rationale |
|----------|-----------|
| Separate Yjs table | Avoid fighting `documents` revision + auth.uid() update trigger |
| Atomic initialize RPC | Prevent concurrent first-load duplicate Yjs histories |
| Separate collab process | Persistent WebSockets are unsuitable for serverless |
| No Redis (yet) | Single-instance demo; add only if multi-node is required |
| Keep JSON projection optional | Export/compat without making JSON authoritative |
| Neutral owner label on Shared with Me | Avoid broadening profile SELECT |
| Sticky application_id + Yjs marker | Exactly-once accept mutation across Postgres/Yjs boundary |
| Relative-position BYTEA anchors | Survive concurrent edits better than absolute indexes |
| Mirrored TipTap schema in collab package | Separate Node service cannot import Next.js `src/` |
| Custom paragraph layout attrs | Persist indent/spacing in Yjs (not CSS-only) |
