# AI workflow

## Tools used

- Cursor Agent (Composer) for Phases 1–5
- Supabase SQL migrations against the hosted project
- Hocuspocus collaboration service (local Node process)

## Phase 4B.1 work

- Added `document_yjs_states` + atomic initialize/store RPCs (service-role only)
- Built `collaboration/` Hocuspocus server with JWT auth, role checks, readOnly viewers, connection registry + Realtime/periodic revoke
- Wired Tiptap Collaboration + CollaborationCaret; disabled Phase 3 content autosave when collab URL is set
- Presence avatars, connection status, durable Yjs persistence with one-time JSON migration
- Added unit + persistence + live two-user WebSocket tests

## Phase 4B.2 work

- Added `comment_threads`, `comment_replies`, `document_suggestions` with RLS and Realtime publication
- Yjs relative-position BYTEA anchors; orphan status when live resolve fails
- Suggestion accept RPCs: claim (sticky `application_id`), complete, fail→conflict, reject, release stale claim
- Client protocol writes `__ajaia_suggestion_apps` marker after applying the accepted edit
- Comments side panel + Suggesting mode on the collaborative editor; Supabase Realtime refresh
- Validation + relative-position unit tests; comments/suggestions RLS + accept-protocol integration tests

## Phase 5 work

- Shared TipTap schema: fonts, size, color, highlight, super/subscript, align, link, tables, clear formatting
- Custom `ParagraphLayout` for indent / first-line / hanging / line height / paragraph spacing
- Docs-like toolbar with selection-safe controls, link + table dialogs
- Mirrored schema in `collaboration/src/schema.ts` for Hocuspocus transformer compatibility
- Formatting unit + Yjs round-trip persistence tests
- No database migrations

## Decisions / rejections

- Yjs BYTEA is authoritative; `content_json` is derived projection only
- Separate Yjs table to avoid `documents` revision/auth.uid() update trigger
- No browser SELECT/mutation policies on `document_yjs_states`
- No Redis / Tiptap Cloud
- Version history and unregistered invites deferred to 4B.3 / 4B.4
- Author email is not exposed on comments/suggestions (display name snapshot only)
- TipTap packages pinned to 3.33.1 (no major upgrades)
- File import added after Phase 5 formatting: TXT/MD → TipTap JSON with validation

## File import work

- Converter for plain text and Markdown subset (headings, lists, bold/italic/links)
- Server actions: create document from upload; parse for in-editor replace
- Dashboard Import button + editor Import control (Owner/Editor)
- Unit tests for validation and conversion

## Dual Vercel deployment work

- Adapted collab for Vercel Fluid Compute WebSockets (`collaboration/api/collab.ts`)
- Shared Hocuspocus config; local `Server.listen()` retained
- Optional/required Redis via `@hocuspocus/extension-redis` for multi-instance
- Documented limits (maxDuration reconnect, Redis for cross-instance)
- Deploy blocked pending interactive `vercel login` (CLI was logged out; anonymous deploy rejected Edge middleware)

## Verification

- `npm run typecheck` / `npm run typecheck:collab`
- `npm run lint`
- `npm test`
- `npm run build`
