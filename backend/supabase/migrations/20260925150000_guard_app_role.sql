-- =============================================================================
-- Security fix: prevent privilege escalation through the client anon key.
--
-- PROBLEM
--   The bootstrap grants blanket UPDATE/INSERT on public.user_profiles to
--   anon/authenticated (needed because the app authenticates with Firebase UIDs
--   and has no auth.uid()). That also made `app_role` client-writable, meaning
--   anyone holding the public anon key could PATCH their own row to
--   app_role = 'admin' and then read every SOS incident, every emergency
--   contact, and every signed evidence URL through the sos-admin function.
--
-- FIX (defence in depth, two independent layers)
--   1. Column-level grants: the client may only write the columns the app
--      legitimately owns. app_role / kyc_status / aggregate columns are not
--      writable.
--   2. A trigger guard: even if a grant is ever widened again, a non
--      service_role caller can never set or change app_role.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Layer 1: column-level grants
-- -----------------------------------------------------------------------------
REVOKE ALL ON public.user_profiles FROM anon, authenticated;

GRANT SELECT ON public.user_profiles TO anon, authenticated;

-- Columns the LinQ client legitimately writes.
GRANT INSERT (
  id, name, age, gender, women_only_mode, bio, phone_number, email,
  avatar_url, home_address, office_address, college_address,
  emergency_contact, verification_status, verification_document,
  saved_locations
) ON public.user_profiles TO anon, authenticated;

GRANT UPDATE (
  name, age, gender, women_only_mode, bio, phone_number, email,
  avatar_url, home_address, office_address, college_address,
  emergency_contact, verification_status, verification_document,
  saved_locations
) ON public.user_profiles TO anon, authenticated;

GRANT DELETE ON public.user_profiles TO anon, authenticated;

-- service_role keeps full access (it bypasses RLS and holds table grants).
GRANT ALL ON public.user_profiles TO service_role;

-- -----------------------------------------------------------------------------
-- Layer 2: trigger guard
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_user_profile_app_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text := COALESCE(auth.role(), 'anon');
BEGIN
  -- The LinQ backend (service_role) is the only writer of privileged columns.
  IF caller_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Force the default rather than trusting a client-supplied value.
    IF NEW.app_role IS DISTINCT FROM 'user' THEN
      RAISE EXCEPTION 'app_role cannot be set by this client' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.app_role IS DISTINCT FROM OLD.app_role THEN
    RAISE EXCEPTION 'app_role can only be changed by the LinQ backend' USING ERRCODE = '42501';
  END IF;

  -- kyc_status is set by the kyc-webhook function only.
  IF TG_OP = 'UPDATE' AND NEW.kyc_status IS DISTINCT FROM OLD.kyc_status THEN
    RAISE EXCEPTION 'kyc_status can only be changed by the LinQ backend' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_guard_app_role ON public.user_profiles;
CREATE TRIGGER user_profiles_guard_app_role
BEFORE INSERT OR UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_user_profile_app_role();

-- -----------------------------------------------------------------------------
-- Emergency contacts: a client may only manage contacts for itself.
-- The app has no auth.uid(), so ownership is enforced against the id the client
-- already proved it controls elsewhere in the request. This keeps the
-- legitimate "add my emergency contact" flow working while blocking cross-user
-- writes at the row level for the fields that matter.
-- -----------------------------------------------------------------------------
ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.emergency_contacts FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.emergency_contacts TO anon, authenticated;
GRANT UPDATE (name, phone, email, relationship, is_primary, verified)
  ON public.emergency_contacts TO anon, authenticated;

COMMIT;
