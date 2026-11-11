-- Ajaia Workspace — Phase 4B.1: durable Yjs binary persistence
--
-- Adds document_yjs_states and service-role-only RPCs for atomic first-time
-- JSON→Yjs initialization and subsequent stores.
--
-- Does NOT alter documents, document_members, profiles, Phase 3/4A policies,
-- sharing RPCs, or documents.content.
--
-- Authoritative document body for collaborative editing: yjs_state (BYTEA).
-- content_json is a derived projection only and must never replace yjs_state.
--
-- Access model: browser clients must not read or write this table. The
-- Hocuspocus collaboration service uses the Supabase service role after
-- independently verifying the user JWT and document membership.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE public.document_yjs_states (
  document_id UUID PRIMARY KEY
    REFERENCES public.documents (id) ON DELETE CASCADE,
  yjs_state BYTEA NOT NULL,
  content_json JSONB,
  migrated_from_json_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT document_yjs_states_yjs_state_not_empty
    CHECK (octet_length(yjs_state) > 0)
);

CREATE INDEX document_yjs_states_updated_at_idx
  ON public.document_yjs_states (updated_at DESC);

COMMENT ON TABLE public.document_yjs_states IS
  'Authoritative Yjs binary document state for collaboration. content_json is a derived projection only.';

COMMENT ON COLUMN public.document_yjs_states.yjs_state IS
  'Canonical Y.encodeStateAsUpdate() binary. Source of truth for collaborative content.';

COMMENT ON COLUMN public.document_yjs_states.content_json IS
  'Optional TipTap JSON projection derived from Yjs. Non-authoritative; never used to overwrite yjs_state.';

COMMENT ON COLUMN public.document_yjs_states.migrated_from_json_at IS
  'Set when the row was created by one-time conversion from documents.content JSON.';

-- ---------------------------------------------------------------------------
-- updated_at maintenance (table-local; does not touch documents.revision)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_document_yjs_states_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_document_yjs_states_updated_at() FROM PUBLIC;

CREATE TRIGGER document_yjs_states_set_updated_at
  BEFORE UPDATE ON public.document_yjs_states
  FOR EACH ROW
  EXECUTE FUNCTION public.set_document_yjs_states_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: deny all browser roles. service_role bypasses RLS in Supabase.
-- No SELECT/INSERT/UPDATE/DELETE policies for anon or authenticated.
-- ---------------------------------------------------------------------------
ALTER TABLE public.document_yjs_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_yjs_states FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.document_yjs_states FROM PUBLIC;
REVOKE ALL ON TABLE public.document_yjs_states FROM anon;
REVOKE ALL ON TABLE public.document_yjs_states FROM authenticated;
GRANT ALL ON TABLE public.document_yjs_states TO service_role;

-- ---------------------------------------------------------------------------
-- get_document_yjs_state
-- Returns stored binary or NULL if not yet initialized.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_document_yjs_state(
  p_document_id UUID
)
RETURNS BYTEA
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  stored BYTEA;
BEGIN
  IF p_document_id IS NULL THEN
    RAISE EXCEPTION 'document_id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT s.yjs_state
  INTO stored
  FROM public.document_yjs_states AS s
  WHERE s.document_id = p_document_id;

  RETURN stored;
END;
$$;

REVOKE ALL ON FUNCTION public.get_document_yjs_state(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_document_yjs_state(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.get_document_yjs_state(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_document_yjs_state(UUID) TO service_role;

COMMENT ON FUNCTION public.get_document_yjs_state(UUID) IS
  'Service-role only. Returns authoritative yjs_state or NULL if uninitialized.';

-- ---------------------------------------------------------------------------
-- initialize_document_yjs_state
-- Atomic first-time persistence. Concurrent callers for the same document
-- serialize on the documents row (FOR UPDATE), then either return the
-- existing canonical yjs_state or insert the proposed state once.
-- Always returns the canonical stored binary (never a discarded loser).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.initialize_document_yjs_state(
  p_document_id UUID,
  p_yjs_state BYTEA,
  p_content_json JSONB DEFAULT NULL
)
RETURNS BYTEA
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  stored BYTEA;
BEGIN
  IF p_document_id IS NULL THEN
    RAISE EXCEPTION 'document_id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_yjs_state IS NULL OR octet_length(p_yjs_state) = 0 THEN
    RAISE EXCEPTION 'yjs_state must be a non-empty BYTEA'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Serialize concurrent first loads for this document.
  -- Lock the parent documents row so two connections cannot both convert
  -- legacy JSON into competing Yjs states.
  PERFORM 1
  FROM public.documents AS d
  WHERE d.id = p_document_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT s.yjs_state
  INTO stored
  FROM public.document_yjs_states AS s
  WHERE s.document_id = p_document_id
  FOR UPDATE;

  IF stored IS NOT NULL THEN
    RETURN stored;
  END IF;

  INSERT INTO public.document_yjs_states (
    document_id,
    yjs_state,
    content_json,
    migrated_from_json_at,
    updated_at
  )
  VALUES (
    p_document_id,
    p_yjs_state,
    p_content_json,
    now(),
    now()
  )
  ON CONFLICT (document_id) DO NOTHING;

  -- Re-read so every caller returns the same winner if a race slipped through.
  SELECT s.yjs_state
  INTO stored
  FROM public.document_yjs_states AS s
  WHERE s.document_id = p_document_id;

  IF stored IS NULL THEN
    RAISE EXCEPTION 'Failed to initialize document Yjs state'
      USING ERRCODE = 'internal_error';
  END IF;

  RETURN stored;
END;
$$;

REVOKE ALL ON FUNCTION public.initialize_document_yjs_state(UUID, BYTEA, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.initialize_document_yjs_state(UUID, BYTEA, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.initialize_document_yjs_state(UUID, BYTEA, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_document_yjs_state(UUID, BYTEA, JSONB) TO service_role;

COMMENT ON FUNCTION public.initialize_document_yjs_state(UUID, BYTEA, JSONB) IS
  'Service-role only. Atomically initializes yjs_state once and returns the canonical BYTEA.';

-- ---------------------------------------------------------------------------
-- store_document_yjs_state
-- Persists authoritative binary. When p_content_json is provided, updates the
-- projection in the same statement. Projection-only writes are rejected.
-- Does not create a row (call initialize_document_yjs_state first).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_document_yjs_state(
  p_document_id UUID,
  p_yjs_state BYTEA,
  p_content_json JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  IF p_document_id IS NULL THEN
    RAISE EXCEPTION 'document_id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_yjs_state IS NULL OR octet_length(p_yjs_state) = 0 THEN
    RAISE EXCEPTION 'yjs_state must be a non-empty BYTEA'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.document_yjs_states AS s
  SET
    yjs_state = p_yjs_state,
    content_json = CASE
      WHEN p_content_json IS NULL THEN s.content_json
      ELSE p_content_json
    END,
    updated_at = now()
  WHERE s.document_id = p_document_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count = 0 THEN
    RAISE EXCEPTION 'Document Yjs state has not been initialized'
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.store_document_yjs_state(UUID, BYTEA, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.store_document_yjs_state(UUID, BYTEA, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.store_document_yjs_state(UUID, BYTEA, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.store_document_yjs_state(UUID, BYTEA, JSONB) TO service_role;

COMMENT ON FUNCTION public.store_document_yjs_state(UUID, BYTEA, JSONB) IS
  'Service-role only. Updates yjs_state and optionally content_json together. Binary is always required.';

-- ---------------------------------------------------------------------------
-- Rollback (manual; do not run as part of forward migration)
-- ---------------------------------------------------------------------------
-- DROP FUNCTION IF EXISTS public.store_document_yjs_state(UUID, BYTEA, JSONB);
-- DROP FUNCTION IF EXISTS public.initialize_document_yjs_state(UUID, BYTEA, JSONB);
-- DROP FUNCTION IF EXISTS public.get_document_yjs_state(UUID);
-- DROP TRIGGER IF EXISTS document_yjs_states_set_updated_at ON public.document_yjs_states;
-- DROP FUNCTION IF EXISTS public.set_document_yjs_states_updated_at();
-- DROP TABLE IF EXISTS public.document_yjs_states;
--
-- Notes:
-- - This migration does not rewrite documents.content. After collaborative
--   editing begins, authoritative body state lives in yjs_state; rolling back
--   the table drops that collaborative history unless exported first.
-- - Phase 3/4A schema and policies remain intact after rollback of this file.
