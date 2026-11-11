# Supabase

## Apply migrations

1. Create a Supabase project.
2. Copy the project URL and anon key into `.env.local` (see `.env.example`).
3. Apply SQL migrations from `supabase/migrations/` using one of:

```bash
# Supabase CLI (recommended)
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push

# Or paste/run the migration SQL in the Supabase SQL Editor (in filename order).
```

## Auth settings

- Enable Email provider.
- For local/demo review, disable email confirmation or use confirmed demo accounts.
- Do not put the service-role key in client code.

## Security model (summary)

- Owners are stored on `documents.owner_id` only (not duplicated in `document_members`).
- Collaborators are `editor` or `viewer` rows in `document_members`.
- RLS helpers (`is_document_owner`, `has_document_access`, `can_edit_document`) are `SECURITY DEFINER` with `search_path = ''` to avoid recursive policies.
- Profile emails are not broadly selectable; sharing uses `share_document_by_email`.
- Authenticated users may update only `profiles.full_name` and `profiles.avatar_url` (column privileges). Email syncs from `auth.users` via `sync_profile_email_from_auth`.
- Document writes require an authenticated user session (`auth.uid()`); do not use the service-role key for normal document updates.
- Stale-write prevention: client `UPDATE ... WHERE revision = expected`; trigger only checks `revision` advances by 1.
- Non-owners cannot change `title` or `owner_id` (enforced by trigger + RLS).
- Re-sharing with an existing collaborator raises `User already has access to this document`.

## Known PostgREST quirk (documents insert)

`INSERT ... RETURNING` on `public.documents` currently fails with an RLS error, while a bare insert plus a follow-up `SELECT` succeeds for the owner. Phase 2 create uses a client-generated UUID + select workaround. Do not weaken RLS to “fix” it without an explicit migration decision.
