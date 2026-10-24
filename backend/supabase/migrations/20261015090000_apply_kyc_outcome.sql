-- =============================================================================
-- Atomic application of a terminal Cashfree KYC outcome.
--
-- WHY THIS EXISTS (review findings C1 + C2)
--   The webhook used to do two independent writes from TypeScript:
--
--       UPDATE kyc_sessions  SET status = 'verified'   -- committed
--       UPDATE user_profiles SET ... = 'verified'      -- could fail
--
--   Each is its own transaction. If the second failed, the handler returned 500
--   and Cashfree retried, but the session row had already been committed as
--   'verified'. The retry's idempotency guard compared against that row, saw
--   'verified' === 'verified', and returned early. The profile was never
--   updated and the rider was permanently stuck, despite a genuinely successful
--   verification.
--
--   Moving both writes into one function makes them one transaction. If either
--   side fails, both roll back and the session stays 'pending', so the next
--   delivery is free to complete the work.
--
-- IDENTITY
--   This function takes no user id. The rider is resolved solely through
--   kyc_sessions.verification_id -> user_id, which is written server-side when
--   the session is created. Nothing a caller supplies names a profile directly.
--
-- H1 -- status values
--   The CHECK constraint from 20261014090000 is deliberately LEFT ALITTLE
--   CHANGED, and this migration does not rewrite that file. Alignment is done in
--   TypeScript by separating three distinct sets (see
--   _shared/cashfreeWebhook.ts):
--
--     KycSessionStatus  pending | verified | failed | expired   (persisted)
--     TerminalOutcome   verified | expired                     (writable here)
--     KycOutcome        ... plus in_progress | ignored         (in-memory only)
--
--   'failed' is KEPT. Cashfree documents no failure event for KYC Links (only
--   KYC_LINK_ACTION_PERFORMED, KYC_LINK_SUCCESS, KYC_LINK_EXPIRED), so nothing
--   writes 'failed' today. It is retained because the table is service-role only
--   and unreachable by clients, so an unused enum member is inert, while removing
--   it would force another migration the moment a documented failure event or a
--   reviewed admin decision needs to record one.
--
--   Note this is NOT the same as 'expired': expiry means the rider abandoned
--   the journey, whereas 'failed' would mean a rejection. Conflating them would
--   be a lie to the data.
-- =============================================================================

BEGIN;

COMMENT ON COLUMN public.kyc_sessions.status IS
  'Persisted lifecycle state. Terminal and writable via apply_kyc_outcome(): '
  '''verified'', ''expired''. ''pending'' is the default for an issued-but-unread '
  'session. ''failed'' is reserved for a future trusted rejection path and is '
  'written by nothing today, because Cashfree documents no KYC Links failure '
  'event. The in-memory classifier also produces ''in_progress'' and ''ignored'', '
  'but those are never persisted.';

-- -----------------------------------------------------------------------------
-- apply_kyc_outcome
--
-- Applies a terminal Cashfree outcome to the session and, for a success, to the
-- rider's profile, atomically.
--
-- Returns (changed, resolved_user_id):
--   changed = false  the session did not exist, or was already in this state,
--                    or is 'verified' and a late 'expired' arrived.
--   changed = true   the transition was applied in this call.
--
-- Raises 22023 (invalid_parameter_value) for any outcome other than the two
-- approved terminal values, so a caller cannot invent a third state.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_kyc_outcome(
  p_verification_id text,
  p_outcome         text
)
RETURNS TABLE (changed boolean, resolved_user_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_session public.kyc_sessions%ROWTYPE;
BEGIN
  -- 1. Only the two approved terminal transitions are writable here.
  IF p_outcome IS NULL OR p_outcome NOT IN ('verified', 'expired') THEN
    RAISE EXCEPTION 'apply_kyc_outcome: unsupported outcome %',
      coalesce(p_outcome, '<null>')
      USING ERRCODE = '22023';
  END IF;

  -- 2. Resolve the rider from the trusted mapping and serialise concurrent
  --    deliveries for the same session. Two simultaneous SUCCESS events block
  --    here; the second re-reads the committed row and then short-circuits on
  --    the idempotency check below.
  SELECT * INTO v_session
    FROM public.kyc_sessions
   WHERE verification_id = p_verification_id
     FOR UPDATE;

  -- 3. Unknown id: not an error. The caller reports it and moves on. This
  --    function must not create rows, so a crafted id can never invent a
  --    session or a rider.
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text;
    RETURN;
  END IF;

  -- 4. Idempotency. Same state already recorded: a redelivery, not a change.
  IF v_session.status = p_outcome THEN
    RETURN QUERY SELECT false, v_session.user_id;
    RETURN;
  END IF;

  -- 5. 'verified' is sticky. A link can emit an expiry after a success has
  --    already been recorded (the documented EXPIRED payload shows sub-checks
  --    still reporting SUCCESS). Un-verifying a rider would be worse than
  --    leaving a stale session label, so the terminal state wins.
  IF v_session.status = 'verified' AND p_outcome = 'expired' THEN
    RETURN QUERY SELECT false, v_session.user_id;
    RETURN;
  END IF;

  -- 6. Record the session outcome.
  UPDATE public.kyc_sessions
     SET status = p_outcome
   WHERE verification_id = p_verification_id;

  -- 7. Expiry stops here. It is never allowed to touch a profile, so an expired
  --    link can never verify anyone. user_profiles has no 'expired' value in its
  --    CHECK constraint, and the rider stays 'pending' and can simply retry.
  IF p_outcome = 'expired' THEN
    RETURN QUERY SELECT true, v_session.user_id;
    RETURN;
  END IF;

  -- 8. Success promotes the profile, addressed only by the mapping's user_id.
  --
  --    verification_document RULE: the first verified document wins. A late
  --    SUCCESS for an older session of a different type must not rewrite which
  --    document the rider is displayed as verified against, so an already
  --    verified profile keeps the document it was verified with.
  UPDATE public.user_profiles
     SET kyc_status          = 'verified',
         verification_status = 'verified',
         verification_document = CASE
           WHEN verification_status = 'verified' THEN verification_document
           ELSE v_session.doc_type
         END,
         updated_at          = now()
   WHERE id = v_session.user_id;

  RETURN QUERY SELECT true, v_session.user_id;
END;
$fn$;

-- -----------------------------------------------------------------------------
-- Execution rights.
--
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default, which would
-- make this RPC callable by every client holding the public anon key -- and the
-- function is SECURITY DEFINER, so a caller would gain the ability to mark any
-- profile verified by supplying any known verification id. PUBLIC must go.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.apply_kyc_outcome(text, text) FROM PUBLIC;

-- anon/authenticated exist on every Supabase project, but the conditional guard
-- keeps this migration replayable against a bare local database.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.apply_kyc_outcome(text, text) FROM %I', r);
    END IF;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.apply_kyc_outcome(text, text) TO service_role;

COMMENT ON FUNCTION public.apply_kyc_outcome(text, text) IS
  'Atomically applies a terminal Cashfree KYC outcome (verified | expired) to a '
  'session and, for a success, to the rider profile. Resolves the rider solely '
  'from kyc_sessions.verification_id. service_role only. See migration '
  '20261015090000_apply_kyc_outcome.sql for the full rationale.';

COMMIT;