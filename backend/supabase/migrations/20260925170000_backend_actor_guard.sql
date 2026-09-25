-- =============================================================================
-- Correction: the app_role / contact-verification guards must permit the actual
-- backend, not just the JWT `service_role`.
--
-- `supabase db query` (and any direct SQL administration, migrations, the
-- Supabase console, psql) runs as the database owner `postgres`, which has no
-- JWT, so `auth.role()` is NULL. The previous revision therefore blocked
-- legitimate administration such as promoting a real operator to admin.
--
-- Allowed callers are now: the `service_role` JWT role, the database owner, and
-- the Supabase internal admin role. Everyone else (anon/authenticated clients)
-- is still blocked, which is the property that matters.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.linq_is_backend_actor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(auth.role(), '') IN ('service_role')
      OR COALESCE(current_user, '') IN ('postgres', 'supabase_admin', 'service_role');
$$;

CREATE OR REPLACE FUNCTION public.guard_user_profile_app_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.linq_is_backend_actor() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.app_role IS DISTINCT FROM 'user' THEN
      RAISE EXCEPTION 'app_role cannot be set by this client' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.app_role IS DISTINCT FROM OLD.app_role THEN
    RAISE EXCEPTION 'app_role can only be changed by the LinQ backend' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.kyc_status IS DISTINCT FROM OLD.kyc_status THEN
    RAISE EXCEPTION 'kyc_status can only be changed by the LinQ backend' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_emergency_contact_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.linq_is_backend_actor() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.verified := false;
    NEW.verified_at := NULL;
  ELSIF NEW.verified IS DISTINCT FROM OLD.verified
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
    RAISE EXCEPTION 'emergency contact verification can only be set by the LinQ backend'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.linq_is_backend_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.linq_is_backend_actor() TO service_role;

COMMIT;
