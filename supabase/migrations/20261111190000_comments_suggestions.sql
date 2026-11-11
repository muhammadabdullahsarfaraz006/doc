-- Ajaia Workspace — Phase 4B.2: persistent comments and suggestions
--
-- Additive only. Does NOT alter:
--   documents, document_members, profiles, document_yjs_states,
--   Phase 3 revision guards, Phase 4A sharing RPCs/policies,
--   or Yjs binary persistence architecture.
--
-- Authoritative document body remains document_yjs_states.yjs_state.
--
-- Anchors (BYTEA serialization contract — app must follow exactly):
--   1. Client: rel = Y.createRelativePositionFromTypeIndex(type, index[, assoc])
--   2. Client: bytes = Y.encodeRelativePosition(rel)  // Uint8Array
--   3. Wire/PostgREST: send as hex string  '\\x' || Buffer.from(bytes).toString('hex')
--      (same pattern as document_yjs_states.yjs_state in Phase 4B.1)
--   4. Postgres stores BYTEA; PostgREST returns '\\x...' hex (or base64 depending on
--      client decoding — prefer hex round-trip in app helpers).
--   5. Client: Y.decodeRelativePosition(decodedUint8Array) then
--      Y.createAbsolutePositionFromRelativePosition(decoded, ydoc)
--   Never persist JSON.stringify of RelativePosition as the canonical form.
--
-- Author identity: triggers force author_id = auth.uid() and snapshot
-- author_full_name only (no author_email exposed to collaborators).
--
-- Suggestion accept concurrency + idempotency:
--   pending --claim(+application_id)--> applying --complete--> accepted
--                                      \--fail----> conflict
--   Abandoned applying (lease expired, no Yjs marker) may release → pending.
--
-- Exactly-once for the Yjs mutation is achieved by:
--   1. Sticky application_id generated once at claim (never regenerated on resume).
--   2. Yjs Map "__ajaia_suggestion_apps" (suggestion_id → application_id) written
--      in the SAME Y.transact() as the accepted edit (part of yjs_state).
--   3. On resume: if marker == application_id, skip mutation and complete only.
--   Cross-system (Yjs vs Postgres) is not a single ACID transaction; the Yjs
--   marker is the durable "mutation applied" truth. Postgres status catches up.

-- ---------------------------------------------------------------------------
-- comment_threads
-- ---------------------------------------------------------------------------
CREATE TABLE public.comment_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL
    REFERENCES public.documents (id) ON DELETE CASCADE,
  author_id UUID NOT NULL
    REFERENCES public.profiles (id) ON DELETE RESTRICT,
  author_full_name TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  selected_text_snapshot TEXT NOT NULL DEFAULT '',
  anchor_start BYTEA NOT NULL,
  anchor_end BYTEA NOT NULL,
  anchor_status TEXT NOT NULL DEFAULT 'active',
  resolved BOOLEAN NOT NULL DEFAULT false,
  -- RESTRICT: preserve resolver identity; block profile deletion while referenced.
  resolved_by UUID REFERENCES public.profiles (id) ON DELETE RESTRICT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT comment_threads_body_length
    CHECK (char_length(body) BETWEEN 1 AND 10000),
  CONSTRAINT comment_threads_selected_text_length
    CHECK (char_length(selected_text_snapshot) <= 20000),
  CONSTRAINT comment_threads_anchor_status_check
    CHECK (anchor_status IN ('active', 'orphaned')),
  CONSTRAINT comment_threads_anchor_start_not_empty
    CHECK (octet_length(anchor_start) > 0),
  CONSTRAINT comment_threads_anchor_end_not_empty
    CHECK (octet_length(anchor_end) > 0),
  CONSTRAINT comment_threads_resolved_consistency
    CHECK (
      (resolved = false AND resolved_by IS NULL AND resolved_at IS NULL)
      OR (resolved = true AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
    )
);

CREATE INDEX comment_threads_document_id_idx
  ON public.comment_threads (document_id);

CREATE INDEX comment_threads_document_unresolved_idx
  ON public.comment_threads (document_id)
  WHERE resolved = false;

CREATE INDEX comment_threads_document_anchor_status_idx
  ON public.comment_threads (document_id, anchor_status);

CREATE INDEX comment_threads_author_id_idx
  ON public.comment_threads (author_id);

COMMENT ON TABLE public.comment_threads IS
  'Persistent document comment threads with Yjs relative-position anchors.';

COMMENT ON COLUMN public.comment_threads.anchor_start IS
  'Y.encodeRelativePosition() binary (hex \\x… via PostgREST). Selection start.';

COMMENT ON COLUMN public.comment_threads.anchor_end IS
  'Y.encodeRelativePosition() binary (hex \\x… via PostgREST). Selection end.';

COMMENT ON COLUMN public.comment_threads.selected_text_snapshot IS
  'Plain-text snapshot of the selection at create time for orphan fallback.';

COMMENT ON COLUMN public.comment_threads.author_full_name IS
  'Display snapshot from profiles at insert; email is intentionally not stored.';

COMMENT ON COLUMN public.comment_threads.anchor_status IS
  'Forced active on insert. Application may set orphaned only after failed live Y.Doc resolve.';

COMMENT ON COLUMN public.comment_threads.resolved_by IS
  'ON DELETE RESTRICT preserves review history; profile delete blocked while referenced.';

-- ---------------------------------------------------------------------------
-- comment_replies
-- ---------------------------------------------------------------------------
CREATE TABLE public.comment_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL
    REFERENCES public.comment_threads (id) ON DELETE CASCADE,
  author_id UUID NOT NULL
    REFERENCES public.profiles (id) ON DELETE RESTRICT,
  author_full_name TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT comment_replies_body_length
    CHECK (char_length(body) BETWEEN 1 AND 10000)
);

CREATE INDEX comment_replies_thread_id_idx
  ON public.comment_replies (thread_id);

CREATE INDEX comment_replies_author_id_idx
  ON public.comment_replies (author_id);

COMMENT ON TABLE public.comment_replies IS
  'Replies attached to a comment thread. Cascade-deleted with the thread.';

-- ---------------------------------------------------------------------------
-- document_suggestions
-- ---------------------------------------------------------------------------
CREATE TABLE public.document_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL
    REFERENCES public.documents (id) ON DELETE CASCADE,
  author_id UUID NOT NULL
    REFERENCES public.profiles (id) ON DELETE RESTRICT,
  author_full_name TEXT NOT NULL DEFAULT '',
  suggestion_type TEXT NOT NULL,
  original_text TEXT NOT NULL DEFAULT '',
  proposed_content JSONB NOT NULL DEFAULT '{}'::jsonb,
  anchor_start BYTEA NOT NULL,
  anchor_end BYTEA NOT NULL,
  -- pending | applying | accepted | rejected | conflict
  status TEXT NOT NULL DEFAULT 'pending',
  -- Sticky accept-attempt id. Generated once on claim; never regenerated on resume.
  -- Must match the value written into Yjs Map "__ajaia_suggestion_apps".
  application_id UUID,
  claim_expires_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles (id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  conflict_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT document_suggestions_type_check
    CHECK (suggestion_type IN ('insertion', 'deletion', 'replacement')),
  CONSTRAINT document_suggestions_status_check
    CHECK (status IN ('pending', 'applying', 'accepted', 'rejected', 'conflict')),
  CONSTRAINT document_suggestions_original_text_length
    CHECK (char_length(original_text) <= 50000),
  CONSTRAINT document_suggestions_anchor_start_not_empty
    CHECK (octet_length(anchor_start) > 0),
  CONSTRAINT document_suggestions_anchor_end_not_empty
    CHECK (octet_length(anchor_end) > 0),
  CONSTRAINT document_suggestions_proposed_content_object
    CHECK (jsonb_typeof(proposed_content) = 'object'),
  CONSTRAINT document_suggestions_review_consistency
    CHECK (
      (
        status = 'pending'
        AND reviewed_by IS NULL
        AND reviewed_at IS NULL
        AND application_id IS NULL
        AND claim_expires_at IS NULL
      )
      OR (
        status = 'rejected'
        AND reviewed_by IS NOT NULL
        AND reviewed_at IS NOT NULL
        AND application_id IS NULL
        AND claim_expires_at IS NULL
      )
      OR (
        status = 'applying'
        AND reviewed_by IS NOT NULL
        AND reviewed_at IS NOT NULL
        AND application_id IS NOT NULL
        AND claim_expires_at IS NOT NULL
      )
      OR (
        status IN ('accepted', 'conflict')
        AND reviewed_by IS NOT NULL
        AND reviewed_at IS NOT NULL
        AND application_id IS NOT NULL
      )
    )
);

CREATE INDEX document_suggestions_document_id_idx
  ON public.document_suggestions (document_id);

CREATE INDEX document_suggestions_document_pending_idx
  ON public.document_suggestions (document_id)
  WHERE status = 'pending';

CREATE INDEX document_suggestions_document_applying_idx
  ON public.document_suggestions (document_id)
  WHERE status = 'applying';

CREATE INDEX document_suggestions_document_status_idx
  ON public.document_suggestions (document_id, status);

CREATE INDEX document_suggestions_author_id_idx
  ON public.document_suggestions (author_id);

COMMENT ON TABLE public.document_suggestions IS
  'Tracked edit suggestions. Not applied to Yjs until accept claim + marker protocol.';

COMMENT ON COLUMN public.document_suggestions.status IS
  'pending → applying → accepted|conflict; pending → rejected; stale applying may release → pending.';

COMMENT ON COLUMN public.document_suggestions.application_id IS
  'Sticky accept-attempt UUID. Paired with Yjs Map __ajaia_suggestion_apps for dedupe.';

COMMENT ON COLUMN public.document_suggestions.claim_expires_at IS
  'Lease for applying. After expiry, app may release only if Yjs marker is absent.';

COMMENT ON COLUMN public.document_suggestions.reviewed_by IS
  'ON DELETE RESTRICT preserves reviewer identity.';

-- ---------------------------------------------------------------------------
-- updated_at helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
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

REVOKE ALL ON FUNCTION public.set_updated_at_timestamp() FROM PUBLIC;

CREATE TRIGGER comment_threads_set_updated_at
  BEFORE UPDATE ON public.comment_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER comment_replies_set_updated_at
  BEFORE UPDATE ON public.comment_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TRIGGER document_suggestions_set_updated_at
  BEFORE UPDATE ON public.document_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

-- ---------------------------------------------------------------------------
-- Author identity + comment thread rules
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_comment_thread_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := (SELECT auth.uid());
  profile_row public.profiles%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.author_id := current_user_id;
    SELECT * INTO profile_row
    FROM public.profiles AS p
    WHERE p.id = current_user_id;

    IF profile_row.id IS NULL THEN
      RAISE EXCEPTION 'Profile not found'
        USING ERRCODE = 'no_data_found';
    END IF;

    NEW.author_full_name := coalesce(
      nullif(trim(profile_row.full_name), ''),
      split_part(profile_row.email, '@', 1)
    );
    -- Always active on insert; orphaning is an application decision after Y.Doc resolve.
    NEW.anchor_status := 'active';
    NEW.resolved := false;
    NEW.resolved_by := NULL;
    NEW.resolved_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.document_id IS DISTINCT FROM OLD.document_id
     OR NEW.author_id IS DISTINCT FROM OLD.author_id
     OR NEW.author_full_name IS DISTINCT FROM OLD.author_full_name
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Immutable comment thread fields cannot be changed'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.body IS DISTINCT FROM OLD.body
     OR NEW.selected_text_snapshot IS DISTINCT FROM OLD.selected_text_snapshot
     OR NEW.anchor_start IS DISTINCT FROM OLD.anchor_start
     OR NEW.anchor_end IS DISTINCT FROM OLD.anchor_end THEN
    IF current_user_id IS DISTINCT FROM OLD.author_id THEN
      RAISE EXCEPTION 'Only the comment author can edit comment content'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- anchor_status: active → orphaned only (never back to active silently inventing a location).
  IF NEW.anchor_status IS DISTINCT FROM OLD.anchor_status THEN
    IF NOT (OLD.anchor_status = 'active' AND NEW.anchor_status = 'orphaned') THEN
      RAISE EXCEPTION 'Invalid anchor_status transition'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF NOT public.can_edit_document(OLD.document_id) THEN
      RAISE EXCEPTION 'Only editors can mark comment anchors orphaned'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NEW.resolved IS DISTINCT FROM OLD.resolved THEN
    IF NEW.resolved THEN
      NEW.resolved_by := current_user_id;
      NEW.resolved_at := now();
    ELSE
      NEW.resolved_by := NULL;
      NEW.resolved_at := NULL;
    END IF;
  ELSIF NEW.resolved = true THEN
    NEW.resolved_by := OLD.resolved_by;
    NEW.resolved_at := OLD.resolved_at;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_comment_thread_author() FROM PUBLIC;

CREATE TRIGGER comment_threads_enforce_author
  BEFORE INSERT OR UPDATE ON public.comment_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_comment_thread_author();

CREATE OR REPLACE FUNCTION public.enforce_comment_reply_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := (SELECT auth.uid());
  profile_row public.profiles%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.author_id := current_user_id;
    SELECT * INTO profile_row
    FROM public.profiles AS p
    WHERE p.id = current_user_id;

    IF profile_row.id IS NULL THEN
      RAISE EXCEPTION 'Profile not found'
        USING ERRCODE = 'no_data_found';
    END IF;

    NEW.author_full_name := coalesce(
      nullif(trim(profile_row.full_name), ''),
      split_part(profile_row.email, '@', 1)
    );
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.thread_id IS DISTINCT FROM OLD.thread_id
     OR NEW.author_id IS DISTINCT FROM OLD.author_id
     OR NEW.author_full_name IS DISTINCT FROM OLD.author_full_name
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Immutable comment reply fields cannot be changed'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.body IS DISTINCT FROM OLD.body
     AND current_user_id IS DISTINCT FROM OLD.author_id THEN
    RAISE EXCEPTION 'Only the reply author can edit the reply body'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_comment_reply_author() FROM PUBLIC;

CREATE TRIGGER comment_replies_enforce_author
  BEFORE INSERT OR UPDATE ON public.comment_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_comment_reply_author();

CREATE OR REPLACE FUNCTION public.enforce_suggestion_author_and_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := (SELECT auth.uid());
  profile_row public.profiles%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.author_id := current_user_id;
    SELECT * INTO profile_row
    FROM public.profiles AS p
    WHERE p.id = current_user_id;

    IF profile_row.id IS NULL THEN
      RAISE EXCEPTION 'Profile not found'
        USING ERRCODE = 'no_data_found';
    END IF;

    NEW.author_full_name := coalesce(
      nullif(trim(profile_row.full_name), ''),
      split_part(profile_row.email, '@', 1)
    );
    NEW.status := 'pending';
    NEW.application_id := NULL;
    NEW.claim_expires_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.conflict_reason := NULL;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.document_id IS DISTINCT FROM OLD.document_id
     OR NEW.author_id IS DISTINCT FROM OLD.author_id
     OR NEW.author_full_name IS DISTINCT FROM OLD.author_full_name
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.suggestion_type IS DISTINCT FROM OLD.suggestion_type THEN
    RAISE EXCEPTION 'Immutable suggestion fields cannot be changed'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- application_id is sticky once set; only clear via release-to-pending RPC path.
  IF OLD.application_id IS NOT NULL
     AND NEW.application_id IS DISTINCT FROM OLD.application_id
     AND NOT (
       OLD.status = 'applying'
       AND NEW.status = 'pending'
       AND NEW.application_id IS NULL
     ) THEN
    RAISE EXCEPTION 'application_id cannot be changed once assigned'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.original_text IS DISTINCT FROM OLD.original_text
     OR NEW.proposed_content IS DISTINCT FROM OLD.proposed_content
     OR NEW.anchor_start IS DISTINCT FROM OLD.anchor_start
     OR NEW.anchor_end IS DISTINCT FROM OLD.anchor_end THEN
    IF OLD.status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'Only pending suggestions can be edited'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF current_user_id IS DISTINCT FROM OLD.author_id THEN
      RAISE EXCEPTION 'Only the suggestion author can edit pending suggestion content'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- Prefer claim/complete/fail/release RPCs. Allowed transitions:
  -- pending→rejected|applying; applying→accepted|conflict|pending(release).
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'pending' AND NEW.status = 'rejected' THEN
      NEW.reviewed_by := current_user_id;
      NEW.reviewed_at := now();
      NEW.application_id := NULL;
      NEW.claim_expires_at := NULL;
    ELSIF OLD.status = 'pending' AND NEW.status = 'applying' THEN
      NEW.reviewed_by := current_user_id;
      NEW.reviewed_at := now();
      IF NEW.application_id IS NULL THEN
        NEW.application_id := gen_random_uuid();
      END IF;
      IF NEW.claim_expires_at IS NULL THEN
        NEW.claim_expires_at := now() + INTERVAL '5 minutes';
      END IF;
    ELSIF OLD.status = 'applying' AND NEW.status IN ('accepted', 'conflict') THEN
      NEW.reviewed_by := coalesce(OLD.reviewed_by, current_user_id);
      NEW.reviewed_at := coalesce(OLD.reviewed_at, now());
      NEW.application_id := OLD.application_id;
      NEW.claim_expires_at := NULL;
    ELSIF OLD.status = 'applying' AND NEW.status = 'pending' THEN
      -- Stale-claim release only (clears application_id).
      NEW.reviewed_by := NULL;
      NEW.reviewed_at := NULL;
      NEW.application_id := NULL;
      NEW.claim_expires_at := NULL;
      NEW.conflict_reason := NULL;
    ELSE
      RAISE EXCEPTION 'Invalid suggestion status transition; use claim/complete/fail/release RPCs'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
  ELSIF OLD.status IS DISTINCT FROM 'pending' THEN
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.reviewed_at := OLD.reviewed_at;
    NEW.status := OLD.status;
    NEW.application_id := OLD.application_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_suggestion_author_and_review() FROM PUBLIC;

CREATE TRIGGER document_suggestions_enforce_author_and_review
  BEFORE INSERT OR UPDATE ON public.document_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_suggestion_author_and_review();

-- ---------------------------------------------------------------------------
-- Suggestion accept lifecycle RPCs
--
-- Yjs marker keyspace (inside authoritative yjs_state, not a second store):
--   ydoc.getMap('__ajaia_suggestion_apps').set(suggestionId, applicationId)
-- must be written in the SAME Y.transact() as the accepted document mutation.
--
-- App accept flow:
--   1. Resolve anchors; null → conflict path (no guess).
--   2. Verify current target text vs original_text; mismatch → conflict.
--   3. claim_document_suggestion_for_accept(id)
--        - pending: assigns sticky application_id + lease
--        - applying by same reviewer: returns SAME application_id (no regen)
--        - applying by other: error
--   4. marker = ymap.get(suggestionId)
--        - if marker === application_id → skip mutation; go to complete
--        - if marker is other value → fail conflict (anomaly)
--        - if absent → apply edit + set marker in one Y.transact()
--   5. complete_document_suggestion_accept(id, application_id)
--      or fail_document_suggestion_accept(id, application_id, reason)
--
-- Stale applying (lease expired) recovery:
--   A. If marker present for application_id → complete (any editor with access
--      may call complete with that application_id after verifying marker).
--   B. If marker absent → release_stale_suggestion_claim(id) → pending
--      (ONLY after app confirms no marker; never release if marker exists).
--   Other reviewers must NEVER apply a mutation for someone else's claim.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.comment_thread_document_id(p_thread_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT t.document_id
  FROM public.comment_threads AS t
  WHERE t.id = p_thread_id;
$$;

REVOKE ALL ON FUNCTION public.comment_thread_document_id(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.comment_thread_document_id(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_document_suggestion_for_accept(
  p_suggestion_id UUID
)
RETURNS public.document_suggestions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := (SELECT auth.uid());
  claimed public.document_suggestions%ROWTYPE;
  lease_interval INTERVAL := INTERVAL '5 minutes';
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT *
  INTO claimed
  FROM public.document_suggestions AS s
  WHERE s.id = p_suggestion_id
  FOR UPDATE;

  IF claimed.id IS NULL THEN
    RAISE EXCEPTION 'Suggestion not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.can_edit_document(claimed.document_id) THEN
    RAISE EXCEPTION 'Not authorized to accept suggestions'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Resume: same reviewer, same sticky application_id (never regenerate).
  IF claimed.status = 'applying' AND claimed.reviewed_by = current_user_id THEN
    UPDATE public.document_suggestions AS s
    SET
      claim_expires_at = now() + lease_interval,
      updated_at = now()
    WHERE s.id = p_suggestion_id
      AND s.status = 'applying'
      AND s.reviewed_by = current_user_id
      AND s.application_id = claimed.application_id
    RETURNING * INTO claimed;
    RETURN claimed;
  END IF;

  -- Another reviewer's in-flight claim cannot be taken over for mutation.
  IF claimed.status = 'applying' THEN
    RAISE EXCEPTION 'Suggestion is being applied by another reviewer'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  IF claimed.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Suggestion is not pending'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  UPDATE public.document_suggestions AS s
  SET
    status = 'applying',
    application_id = gen_random_uuid(),
    claim_expires_at = now() + lease_interval,
    reviewed_by = current_user_id,
    reviewed_at = now(),
    conflict_reason = NULL,
    updated_at = now()
  WHERE s.id = p_suggestion_id
    AND s.status = 'pending'
  RETURNING * INTO claimed;

  IF claimed.id IS NULL THEN
    RAISE EXCEPTION 'Suggestion claim lost the race'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN claimed;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_document_suggestion_accept(
  p_suggestion_id UUID,
  p_application_id UUID
)
RETURNS public.document_suggestions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := (SELECT auth.uid());
  existing public.document_suggestions%ROWTYPE;
  updated_row public.document_suggestions%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_application_id IS NULL THEN
    RAISE EXCEPTION 'application_id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT *
  INTO existing
  FROM public.document_suggestions AS s
  WHERE s.id = p_suggestion_id
  FOR UPDATE;

  IF existing.id IS NULL THEN
    RAISE EXCEPTION 'Suggestion not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.can_edit_document(existing.document_id) THEN
    RAISE EXCEPTION 'Not authorized to complete suggestion accept'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Idempotent: already accepted with this application_id.
  IF existing.status = 'accepted'
     AND existing.application_id = p_application_id THEN
    RETURN existing;
  END IF;

  -- Completing an applying claim requires matching application_id.
  -- Original claimer OR any current editor may complete after verifying the
  -- Yjs marker (recovery after crash / offline claimer).
  IF existing.status = 'applying'
     AND existing.application_id = p_application_id THEN
    UPDATE public.document_suggestions AS s
    SET
      status = 'accepted',
      claim_expires_at = NULL,
      updated_at = now()
    WHERE s.id = p_suggestion_id
      AND s.status = 'applying'
      AND s.application_id = p_application_id
    RETURNING * INTO updated_row;

    IF updated_row.id IS NULL THEN
      RAISE EXCEPTION 'Suggestion cannot be completed'
        USING ERRCODE = 'exclusion_violation';
    END IF;

    RETURN updated_row;
  END IF;

  RAISE EXCEPTION 'Suggestion cannot be completed for this application_id'
    USING ERRCODE = 'exclusion_violation';
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_document_suggestion_accept(
  p_suggestion_id UUID,
  p_application_id UUID,
  p_conflict_reason TEXT
)
RETURNS public.document_suggestions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := (SELECT auth.uid());
  updated_row public.document_suggestions%ROWTYPE;
  reason TEXT := left(coalesce(nullif(trim(p_conflict_reason), ''), 'Conflict'), 2000);
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_application_id IS NULL THEN
    RAISE EXCEPTION 'application_id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.document_suggestions AS s
  SET
    status = 'conflict',
    conflict_reason = reason,
    claim_expires_at = NULL,
    updated_at = now()
  WHERE s.id = p_suggestion_id
    AND s.status = 'applying'
    AND s.application_id = p_application_id
    AND (
      s.reviewed_by = current_user_id
      OR public.can_edit_document(s.document_id)
    )
  RETURNING * INTO updated_row;

  IF updated_row.id IS NULL THEN
    RAISE EXCEPTION 'Suggestion cannot be marked conflict'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN updated_row;
END;
$$;

-- Release expired applying claim back to pending ONLY when the app has
-- confirmed the Yjs marker is absent. Never call this if the mutation marker exists.
CREATE OR REPLACE FUNCTION public.release_stale_suggestion_claim(
  p_suggestion_id UUID
)
RETURNS public.document_suggestions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := (SELECT auth.uid());
  existing public.document_suggestions%ROWTYPE;
  updated_row public.document_suggestions%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT *
  INTO existing
  FROM public.document_suggestions AS s
  WHERE s.id = p_suggestion_id
  FOR UPDATE;

  IF existing.id IS NULL THEN
    RAISE EXCEPTION 'Suggestion not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.can_edit_document(existing.document_id) THEN
    RAISE EXCEPTION 'Not authorized to release suggestion claim'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF existing.status IS DISTINCT FROM 'applying' THEN
    RAISE EXCEPTION 'Only applying suggestions can be released'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  IF existing.claim_expires_at IS NULL OR existing.claim_expires_at > now() THEN
    RAISE EXCEPTION 'Suggestion claim lease has not expired'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  UPDATE public.document_suggestions AS s
  SET
    status = 'pending',
    application_id = NULL,
    claim_expires_at = NULL,
    reviewed_by = NULL,
    reviewed_at = NULL,
    conflict_reason = NULL,
    updated_at = now()
  WHERE s.id = p_suggestion_id
    AND s.status = 'applying'
    AND s.claim_expires_at IS NOT NULL
    AND s.claim_expires_at <= now()
  RETURNING * INTO updated_row;

  IF updated_row.id IS NULL THEN
    RAISE EXCEPTION 'Suggestion release lost the race'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN updated_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_document_suggestion(
  p_suggestion_id UUID
)
RETURNS public.document_suggestions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := (SELECT auth.uid());
  existing public.document_suggestions%ROWTYPE;
  updated_row public.document_suggestions%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT *
  INTO existing
  FROM public.document_suggestions AS s
  WHERE s.id = p_suggestion_id
  FOR UPDATE;

  IF existing.id IS NULL THEN
    RAISE EXCEPTION 'Suggestion not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.can_edit_document(existing.document_id) THEN
    RAISE EXCEPTION 'Not authorized to reject suggestions'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF existing.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Only pending suggestions can be rejected'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  UPDATE public.document_suggestions AS s
  SET
    status = 'rejected',
    reviewed_by = current_user_id,
    reviewed_at = now(),
    application_id = NULL,
    claim_expires_at = NULL,
    updated_at = now()
  WHERE s.id = p_suggestion_id
    AND s.status = 'pending'
  RETURNING * INTO updated_row;

  IF updated_row.id IS NULL THEN
    RAISE EXCEPTION 'Suggestion reject lost the race'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN updated_row;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_document_suggestion_for_accept(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_document_suggestion_accept(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_document_suggestion_accept(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_stale_suggestion_claim(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_document_suggestion(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.claim_document_suggestion_for_accept(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_document_suggestion_accept(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fail_document_suggestion_accept(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_stale_suggestion_claim(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_document_suggestion(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.comment_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_suggestions ENABLE ROW LEVEL SECURITY;

-- comment_threads
CREATE POLICY comment_threads_select_accessible
  ON public.comment_threads
  FOR SELECT
  TO authenticated
  USING (public.has_document_access(document_id));

CREATE POLICY comment_threads_insert_editor
  ON public.comment_threads
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_edit_document(document_id));

CREATE POLICY comment_threads_update_editor
  ON public.comment_threads
  FOR UPDATE
  TO authenticated
  USING (public.can_edit_document(document_id))
  WITH CHECK (public.can_edit_document(document_id));

-- DELETE requires CURRENT document access AND (author or editor).
CREATE POLICY comment_threads_delete_author_or_editor
  ON public.comment_threads
  FOR DELETE
  TO authenticated
  USING (
    public.has_document_access(document_id)
    AND (
      author_id = (SELECT auth.uid())
      OR public.can_edit_document(document_id)
    )
  );

-- comment_replies
CREATE POLICY comment_replies_select_accessible
  ON public.comment_replies
  FOR SELECT
  TO authenticated
  USING (
    public.has_document_access(public.comment_thread_document_id(thread_id))
  );

CREATE POLICY comment_replies_insert_editor
  ON public.comment_replies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_edit_document(public.comment_thread_document_id(thread_id))
  );

CREATE POLICY comment_replies_update_author
  ON public.comment_replies
  FOR UPDATE
  TO authenticated
  USING (
    author_id = (SELECT auth.uid())
    AND public.can_edit_document(public.comment_thread_document_id(thread_id))
  )
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND public.can_edit_document(public.comment_thread_document_id(thread_id))
  );

CREATE POLICY comment_replies_delete_author_or_editor
  ON public.comment_replies
  FOR DELETE
  TO authenticated
  USING (
    public.has_document_access(public.comment_thread_document_id(thread_id))
    AND (
      author_id = (SELECT auth.uid())
      OR public.can_edit_document(public.comment_thread_document_id(thread_id))
    )
  );

-- document_suggestions
CREATE POLICY document_suggestions_select_accessible
  ON public.document_suggestions
  FOR SELECT
  TO authenticated
  USING (public.has_document_access(document_id));

CREATE POLICY document_suggestions_insert_editor
  ON public.document_suggestions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_edit_document(document_id));

CREATE POLICY document_suggestions_update_editor
  ON public.document_suggestions
  FOR UPDATE
  TO authenticated
  USING (public.can_edit_document(document_id))
  WITH CHECK (public.can_edit_document(document_id));

CREATE POLICY document_suggestions_delete_author_or_editor
  ON public.document_suggestions
  FOR DELETE
  TO authenticated
  USING (
    public.has_document_access(document_id)
    AND (
      (
        author_id = (SELECT auth.uid())
        AND status = 'pending'
      )
      OR public.can_edit_document(document_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.comment_threads FROM PUBLIC;
REVOKE ALL ON TABLE public.comment_threads FROM anon;
REVOKE ALL ON TABLE public.comment_threads FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.comment_threads TO authenticated;
GRANT ALL ON TABLE public.comment_threads TO service_role;

REVOKE ALL ON TABLE public.comment_replies FROM PUBLIC;
REVOKE ALL ON TABLE public.comment_replies FROM anon;
REVOKE ALL ON TABLE public.comment_replies FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.comment_replies TO authenticated;
GRANT ALL ON TABLE public.comment_replies TO service_role;

REVOKE ALL ON TABLE public.document_suggestions FROM PUBLIC;
REVOKE ALL ON TABLE public.document_suggestions FROM anon;
REVOKE ALL ON TABLE public.document_suggestions FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.document_suggestions TO authenticated;
GRANT ALL ON TABLE public.document_suggestions TO service_role;

-- ---------------------------------------------------------------------------
-- Realtime: independently idempotent per table
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'comment_threads'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.comment_threads';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'comment_replies'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.comment_replies';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'document_suggestions'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.document_suggestions';
    END IF;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Rollback (manual; do not run as part of forward migration)
-- ---------------------------------------------------------------------------
-- DROP FUNCTION IF EXISTS public.reject_document_suggestion(UUID);
-- DROP FUNCTION IF EXISTS public.release_stale_suggestion_claim(UUID);
-- DROP FUNCTION IF EXISTS public.fail_document_suggestion_accept(UUID, UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.complete_document_suggestion_accept(UUID, UUID);
-- DROP FUNCTION IF EXISTS public.claim_document_suggestion_for_accept(UUID);
-- DROP FUNCTION IF EXISTS public.comment_thread_document_id(UUID);
-- DROP TRIGGER IF EXISTS document_suggestions_enforce_author_and_review ON public.document_suggestions;
-- DROP TRIGGER IF EXISTS document_suggestions_set_updated_at ON public.document_suggestions;
-- DROP TRIGGER IF EXISTS comment_replies_enforce_author ON public.comment_replies;
-- DROP TRIGGER IF EXISTS comment_replies_set_updated_at ON public.comment_replies;
-- DROP TRIGGER IF EXISTS comment_threads_enforce_author ON public.comment_threads;
-- DROP TRIGGER IF EXISTS comment_threads_set_updated_at ON public.comment_threads;
-- DROP FUNCTION IF EXISTS public.enforce_suggestion_author_and_review();
-- DROP FUNCTION IF EXISTS public.enforce_comment_reply_author();
-- DROP FUNCTION IF EXISTS public.enforce_comment_thread_author();
-- DROP FUNCTION IF EXISTS public.set_updated_at_timestamp();
-- DROP TABLE IF EXISTS public.document_suggestions;
-- DROP TABLE IF EXISTS public.comment_replies;
-- DROP TABLE IF EXISTS public.comment_threads;
