-- =============================================================================
-- Emergency contact grant correction.
--
-- A client must not be able to mark its own emergency contact as `verified`:
-- the `verified` flag is the signal the SOS flow uses to distinguish a contact
-- LinQ has confirmed from one the user simply typed in. Self-verification would
-- let any account manufacture "verified" emergency contacts.
--
-- Fix: column-level INSERT/UPDATE that omits `verified` and `verified_at`.
-- Only the LinQ backend (service_role) can set them.
-- =============================================================================

BEGIN;

REVOKE ALL ON public.emergency_contacts FROM anon, authenticated;

GRANT SELECT, DELETE ON public.emergency_contacts TO anon, authenticated;

GRANT INSERT (user_id, name, phone, email, relationship, is_primary)
  ON public.emergency_contacts TO anon, authenticated;

GRANT UPDATE (name, phone, email, relationship, is_primary)
  ON public.emergency_contacts TO anon, authenticated;

GRANT ALL ON public.emergency_contacts TO service_role;

-- Belt and braces: verified flags are service_role only, even if a grant widens.
CREATE OR REPLACE FUNCTION public.guard_emergency_contact_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), 'anon') = 'service_role' THEN
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

DROP TRIGGER IF EXISTS emergency_contacts_guard_verification ON public.emergency_contacts;
CREATE TRIGGER emergency_contacts_guard_verification
BEFORE INSERT OR UPDATE ON public.emergency_contacts
FOR EACH ROW EXECUTE FUNCTION public.guard_emergency_contact_verification();

COMMIT;
