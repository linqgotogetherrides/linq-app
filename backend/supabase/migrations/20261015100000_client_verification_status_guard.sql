-- =============================================================================
-- Forbid the client from marking a rider verified.
--
-- PROBLEM
--   20260925150000 granted the client UPDATE on a named column list that
--   includes verification_status:
--
--       GRANT UPDATE (
--         name, age, ..., emergency_contact, verification_status,
--         verification_document, saved_locations
--       ) ON public.user_profiles TO anon, authenticated;
--
--   and the column's CHECK permits 'verified':
--
--       CHECK (verification_status IN ('not_verified','pending','verified'))
--
--   So anyone holding the public anon key could PATCH their own row straight to
--   verification_status = 'verified' -- no Cashfree session, no webhook, no
--   document of any kind. The companion column kyc_status was already excluded
--   from that grant, so the protection was half applied.
--
--   Stage 2b removed the in-app client write, but the UI being correct is not a
--   control; the grant is what a caller actually runs into.
--
-- WHY THIS IS A TRIGGER AND NOT A COLUMN REVOKE
--   The obvious second layer -- REVOKE UPDATE (verification_status) -- was
--   rejected on purpose, because it breaks signup:
--
--     * saveProfile() (frontend/src/services/userProfile.ts) inserts a brand new
--       profile with verification_status = 'pending', supplied by
--       account-creation.tsx. That INSERT needs the column grant.
--     * On the UPDATE path PostgREST rejects the entire statement when any SET
--       column is not granted -- the same failure that forced saveProfile to
--       strip `id`. Revoking the column would therefore break the whole
--       profile write, not just the one field.
--
--   Writing 'pending' grants nothing: it cannot un-verify, cannot verify, and
--   is what the app already displays for an unverified rider who has started the
--   journey. So the column grant is left intact and the trigger below is the
--   enforcement point, precisely scoped to the one value that matters.
--
-- WHO MAY SET 'verified' NOW
--   service_role only, exclusively through apply_kyc_outcome()
--   (20261015090000) after a correctly signed KYC_LINK_SUCCESS event whose
--   verification_id resolves to a real kyc_sessions row.
--
-- COMPATIBILITY
--   Nothing at signup changes: a new profile still lands on 'pending' exactly as
--   before. verification_document stays client-writable; choosing which document
--   to present grants no authority without a matching kyc_sessions row and a
--   signed webhook.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Layer 2 of 2: trigger guard.
--
-- Mirrors guard_user_profile_app_role so both privileged columns fail the same
-- way and the next reader finds one pattern rather than two.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_user_profile_verification_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text := COALESCE(auth.role(), 'anon');
BEGIN
  -- The backend is the only writer of verification state.
  IF caller_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- The single forbidden transition. Everything else a client may legitimately
  -- do: setting the default at signup, or moving between the two states that
  -- mean "not verified".
  IF NEW.verification_status = 'verified' THEN
    RAISE EXCEPTION 'verification_status cannot be set to verified by this client'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_guard_verification_status ON public.user_profiles;
CREATE TRIGGER user_profiles_guard_verification_status
BEFORE INSERT OR UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_user_profile_verification_status();

COMMIT;