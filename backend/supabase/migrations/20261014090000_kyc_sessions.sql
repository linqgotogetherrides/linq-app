-- =============================================================================
-- KYC session registry.
--
-- PROBLEM
--   kyc-webhook recovers the rider's identity by splitting the Cashfree
--   verification_id on "_" and taking parts[1]:
--
--       const parts = verificationId.split("_");
--       const userId = parts[1];
--
--   That endpoint performs no signature verification, so the verification_id
--   is attacker-supplied. A forged payload carrying
--   "v_<any-uid>_a_1" marks that arbitrary account kyc_status = 'verified'
--   through the service-role key. Identity must instead come from trusted,
--   server-written state.
--
-- FIX
--   Record who each Cashfree session belongs to at the moment it is created,
--   and have the webhook resolve verification_id -> user_id through this table
--   rather than by parsing a string it was handed.
--
-- This table is deliberately unreadable and unwritable by the client. The app
-- has no auth.uid(), and verification identity is exactly the kind of value
-- that must never be client-owned. Only the service role touches it.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.kyc_sessions (
  -- The id LinQ generated and sent to Cashfree as verification_id. Cashfree
  -- echoes it back on the webhook and accepts it on Get KYC Link Status.
  -- Not a serial: it is minted by the edge function, not the database.
  verification_id text PRIMARY KEY,

  -- Who this session was created for. ON DELETE CASCADE so that deleting a
  -- rider cannot leave a verification row pointing at a profile that is gone.
  user_id text NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,

  -- Mirrors the user_profiles verification_document CHECK so the two cannot
  -- drift, and so the webhook never has to map an abbreviation back.
  doc_type text NOT NULL CHECK (doc_type IN ('aadhaar', 'pan', 'dl')),

  -- Cashfree's own id for this form, returned by Generate KYC Link. Nullable:
  -- it is only known after a successful Cashfree call.
  reference_id bigint,

  -- Cashfree's reported state. 'pending' until the webhook tells us otherwise.
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'failed', 'expired')),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- At most one in-flight session per rider per document, so a rider cannot
-- accumulate parallel pending forms. Partial, not a full UNIQUE: a rider must
-- remain able to fail, retry, and fail again, which a UNIQUE on status would
-- forbid after the second attempt.
CREATE UNIQUE INDEX IF NOT EXISTS kyc_sessions_one_pending_per_doc
  ON public.kyc_sessions (user_id, doc_type)
  WHERE status = 'pending';

-- Webhook lookups are by verification_id (already the primary key). This index
-- supports "what is this rider's current session for PAN", which the status
-- endpoint and the profile screen both ask.
CREATE INDEX IF NOT EXISTS kyc_sessions_user_doc_idx
  ON public.kyc_sessions (user_id, doc_type, created_at DESC);

COMMENT ON TABLE public.kyc_sessions IS
  'Cashfree KYC Link sessions, keyed by the merchant-generated verification_id. '
  'Service-role only. Authoritative source of which rider a Cashfree webhook '
  'event belongs to.';

-- Reuses the trigger function already present from 20260925120000.
DROP TRIGGER IF EXISTS kyc_sessions_set_updated_at ON public.kyc_sessions;
CREATE TRIGGER kyc_sessions_set_updated_at
BEFORE UPDATE ON public.kyc_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Access: service role only.
--
-- No SELECT policy is created, so with RLS enabled every client request is
-- filtered to zero rows. This mirrors emergency_contacts in 20260925150000,
-- where REVOKE plus a narrow GRANT list is the pattern the project already
-- uses to keep client reach explicit.
-- -----------------------------------------------------------------------------
ALTER TABLE public.kyc_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.kyc_sessions FROM anon, authenticated;
GRANT ALL ON public.kyc_sessions TO service_role;

COMMIT;