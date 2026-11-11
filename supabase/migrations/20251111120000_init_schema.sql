-- Ajaia Workspace — initial schema, helpers, RLS, and sharing RPCs
-- Reproducible on a fresh Supabase project. No manual DB steps required.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profiles_email_not_blank CHECK (length(trim(email)) > 0)
);

CREATE UNIQUE INDEX profiles_email_lower_idx ON public.profiles (lower(email));

CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'Untitled document',
  content JSONB NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  owner_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  revision BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT documents_title_not_blank CHECK (length(trim(title)) > 0),
  CONSTRAINT documents_revision_positive CHECK (revision >= 1)
);

CREATE INDEX documents_owner_id_idx ON public.documents (owner_id);
CREATE INDEX documents_updated_at_idx ON public.documents (updated_at DESC);

CREATE TABLE public.document_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT document_members_role_check CHECK (role IN ('editor', 'viewer')),
  CONSTRAINT document_members_document_user_unique UNIQUE (document_id, user_id)
);

CREATE INDEX document_members_user_id_idx ON public.document_members (user_id);
CREATE INDEX document_members_document_id_idx ON public.document_members (document_id);

-- ---------------------------------------------------------------------------
-- Auth → profile bootstrap
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    lower(trim(NEW.email)),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Auth email → profile email sync (trusted path only)
-- Authenticated clients cannot UPDATE profiles.email (column privileges below).
-- This SECURITY DEFINER trigger keeps profiles.email aligned after Auth changes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_profile_email_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.email IS NOT DISTINCT FROM OLD.email THEN
    RETURN NEW;
  END IF;

  IF NEW.email IS NULL OR length(trim(NEW.email)) = 0 THEN
    RAISE EXCEPTION 'auth.users.email cannot be empty when syncing profiles';
  END IF;

  UPDATE public.profiles AS p
  SET email = lower(trim(NEW.email))
  WHERE p.id = NEW.id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_profile_email_from_auth() FROM PUBLIC;

CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_email_from_auth();

-- ---------------------------------------------------------------------------
-- Document update guards: ownership, title, revision integrity, timestamps
--
-- Decision: all document writes must use an authenticated user session
-- (auth.uid() present). Do not update documents with the service-role key
-- in normal application flows. Admin/seed paths should impersonate a user
-- session or use a narrowly scoped, explicitly authorized mechanism later.
--
-- Revision note: this trigger only enforces NEW.revision = OLD.revision + 1.
-- Stale-write prevention requires the caller to conditional-update with
-- WHERE revision = expectedRevision. Zero rows => conflict (Phase 3 autosave).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_document_update_guards()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := (SELECT auth.uid());
BEGIN
  -- Authenticated-session-only writes (see decision above).
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'documents.id cannot be changed';
  END IF;

  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'documents.owner_id cannot be changed';
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'documents.created_at cannot be changed';
  END IF;

  -- Non-owners may not rename documents.
  IF NEW.title IS DISTINCT FROM OLD.title
     AND current_user_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'Only the document owner can rename a document';
  END IF;

  -- Integrity check only: revision must advance by exactly 1 on any update.
  -- Concurrency control is the caller's WHERE revision = expectedRevision.
  IF NEW.revision IS DISTINCT FROM (OLD.revision + 1) THEN
    RAISE EXCEPTION 'Document revision conflict'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_document_update_guards() FROM PUBLIC;

CREATE TRIGGER documents_enforce_update_guards
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_document_update_guards();

-- ---------------------------------------------------------------------------
-- Membership integrity: never add the owner; never change document_id
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_document_member_guards()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  doc_owner UUID;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.document_id IS DISTINCT FROM OLD.document_id THEN
      RAISE EXCEPTION 'document_members.document_id cannot be changed';
    END IF;

    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'document_members.user_id cannot be changed';
    END IF;

    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'document_members.created_at cannot be changed';
    END IF;
  END IF;

  SELECT d.owner_id
  INTO doc_owner
  FROM public.documents d
  WHERE d.id = NEW.document_id;

  IF doc_owner IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  IF NEW.user_id = doc_owner THEN
    RAISE EXCEPTION 'Document owner cannot be added as a collaborator';
  END IF;

  IF NEW.role NOT IN ('editor', 'viewer') THEN
    RAISE EXCEPTION 'Invalid collaborator role';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_document_member_guards() FROM PUBLIC;

CREATE TRIGGER document_members_enforce_guards
  BEFORE INSERT OR UPDATE ON public.document_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_document_member_guards();

-- ---------------------------------------------------------------------------
-- Authorization helpers (SECURITY DEFINER, fixed search_path, no recursion)
-- Callable by authenticated only; return booleans for a known document id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_document_owner(p_document_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.documents AS d
    WHERE d.id = p_document_id
      AND d.owner_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.has_document_access(p_document_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (SELECT public.is_document_owner(p_document_id))
    OR EXISTS (
      SELECT 1
      FROM public.document_members AS m
      WHERE m.document_id = p_document_id
        AND m.user_id = (SELECT auth.uid())
    );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_document(p_document_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (SELECT public.is_document_owner(p_document_id))
    OR EXISTS (
      SELECT 1
      FROM public.document_members AS m
      WHERE m.document_id = p_document_id
        AND m.user_id = (SELECT auth.uid())
        AND m.role = 'editor'
    );
$$;

REVOKE ALL ON FUNCTION public.is_document_owner(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_document_access(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_edit_document(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_document_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_document_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_document(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Sharing RPCs — email resolution stays server-side; no broad profile SELECT
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.share_document_by_email(
  p_document_id UUID,
  p_email TEXT,
  p_role TEXT
)
RETURNS TABLE (
  member_id UUID,
  user_id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := (SELECT auth.uid());
  normalized_email TEXT := lower(trim(p_email));
  target_profile public.profiles%ROWTYPE;
  inserted public.document_members%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.is_document_owner(p_document_id) THEN
    RAISE EXCEPTION 'Only the document owner can share'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_role NOT IN ('editor', 'viewer') THEN
    RAISE EXCEPTION 'Role must be editor or viewer'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF normalized_email IS NULL OR length(normalized_email) = 0 THEN
    RAISE EXCEPTION 'Email is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT *
  INTO target_profile
  FROM public.profiles AS p
  WHERE lower(p.email) = normalized_email;

  IF target_profile.id IS NULL THEN
    RAISE EXCEPTION 'No registered user found with that email'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF target_profile.id = current_user_id THEN
    RAISE EXCEPTION 'You cannot share a document with yourself'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.document_members AS m
    WHERE m.document_id = p_document_id
      AND m.user_id = target_profile.id
  ) THEN
    RAISE EXCEPTION 'User already has access to this document'
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.document_members (document_id, user_id, role)
  VALUES (p_document_id, target_profile.id, p_role)
  RETURNING * INTO inserted;

  RETURN QUERY
  SELECT
    inserted.id,
    target_profile.id,
    target_profile.email,
    target_profile.full_name,
    inserted.role;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_document_member_role(
  p_member_id UUID,
  p_role TEXT
)
RETURNS TABLE (
  member_id UUID,
  user_id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := (SELECT auth.uid());
  existing public.document_members%ROWTYPE;
  member_profile public.profiles%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_role NOT IN ('editor', 'viewer') THEN
    RAISE EXCEPTION 'Role must be editor or viewer'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT *
  INTO existing
  FROM public.document_members AS m
  WHERE m.id = p_member_id;

  IF existing.id IS NULL THEN
    RAISE EXCEPTION 'Collaborator not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_document_owner(existing.document_id) THEN
    RAISE EXCEPTION 'Only the document owner can change collaborator roles'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.document_members AS m
  SET role = p_role
  WHERE m.id = p_member_id
  RETURNING * INTO existing;

  SELECT *
  INTO member_profile
  FROM public.profiles AS p
  WHERE p.id = existing.user_id;

  RETURN QUERY
  SELECT
    existing.id,
    existing.user_id,
    member_profile.email,
    member_profile.full_name,
    existing.role;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_document_member(
  p_member_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := (SELECT auth.uid());
  existing public.document_members%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT *
  INTO existing
  FROM public.document_members AS m
  WHERE m.id = p_member_id;

  IF existing.id IS NULL THEN
    RAISE EXCEPTION 'Collaborator not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_document_owner(existing.document_id) THEN
    RAISE EXCEPTION 'Only the document owner can remove collaborators'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM public.document_members AS m
  WHERE m.id = p_member_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_document_collaborators(
  p_document_id UUID
)
RETURNS TABLE (
  member_id UUID,
  user_id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := (SELECT auth.uid());
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.is_document_owner(p_document_id) THEN
    RAISE EXCEPTION 'Only the document owner can list collaborators'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.user_id,
    p.email,
    p.full_name,
    m.role,
    m.created_at
  FROM public.document_members AS m
  INNER JOIN public.profiles AS p ON p.id = m.user_id
  WHERE m.document_id = p_document_id
  ORDER BY m.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.share_document_by_email(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_document_member_role(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_document_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_document_collaborators(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.share_document_by_email(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_document_member_role(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_document_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_document_collaborators(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_members ENABLE ROW LEVEL SECURITY;

-- profiles: own row only (no directory / email harvest)
CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = id);

CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- No direct INSERT/DELETE for clients; bootstrap via auth trigger.
-- Column privileges (below) further restrict UPDATE to full_name/avatar_url.

-- documents
CREATE POLICY documents_select_accessible
  ON public.documents
  FOR SELECT
  TO authenticated
  USING (public.has_document_access(id));

CREATE POLICY documents_insert_as_owner
  ON public.documents
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = owner_id);

CREATE POLICY documents_update_owner_or_editor
  ON public.documents
  FOR UPDATE
  TO authenticated
  USING (public.can_edit_document(id))
  WITH CHECK (public.can_edit_document(id));

CREATE POLICY documents_delete_owner
  ON public.documents
  FOR DELETE
  TO authenticated
  USING (public.is_document_owner(id));

-- document_members
-- SELECT: owners see all members for a document; users see their own membership.
-- Mutations go through owner-only RPCs (and matching owner-only policies as defense in depth).
CREATE POLICY document_members_select_owner_or_self
  ON public.document_members
  FOR SELECT
  TO authenticated
  USING (
    public.is_document_owner(document_id)
    OR user_id = (SELECT auth.uid())
  );

CREATE POLICY document_members_insert_owner
  ON public.document_members
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_document_owner(document_id));

CREATE POLICY document_members_update_owner
  ON public.document_members
  FOR UPDATE
  TO authenticated
  USING (public.is_document_owner(document_id))
  WITH CHECK (public.is_document_owner(document_id));

CREATE POLICY document_members_delete_owner
  ON public.document_members
  FOR DELETE
  TO authenticated
  USING (public.is_document_owner(document_id));

-- ---------------------------------------------------------------------------
-- Table / column privileges
-- Authenticated users may update only profile display fields — not email/id.
-- Email changes flow exclusively through auth.users → sync_profile_email_from_auth.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.profiles FROM PUBLIC;
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.profiles FROM authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (full_name, avatar_url) ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

REVOKE ALL ON TABLE public.documents FROM PUBLIC;
REVOKE ALL ON TABLE public.documents FROM anon;
REVOKE ALL ON TABLE public.documents FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.documents TO authenticated;
GRANT ALL ON TABLE public.documents TO service_role;

REVOKE ALL ON TABLE public.document_members FROM PUBLIC;
REVOKE ALL ON TABLE public.document_members FROM anon;
REVOKE ALL ON TABLE public.document_members FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.document_members TO authenticated;
GRANT ALL ON TABLE public.document_members TO service_role;
