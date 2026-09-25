-- =============================================================================
-- LinQ SOS Safety System
-- Tables: emergency_contacts, sos_incidents, sos_locations, sos_evidence,
--         sos_contact_alerts
--
-- Security model (deliberately stricter than the legacy permissive bootstrap):
--   * All SOS tables are REVOKEd from anon/authenticated. The mobile client has
--     NO direct table access. Every read/write goes through a Supabase Edge
--     Function running with the service-role key, which validates the caller.
--   * The sos-evidence storage bucket is PRIVATE. No public URLs exist. Files
--     are only reachable through short-lived signed URLs minted server-side.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Admin / safety-team role
-- -----------------------------------------------------------------------------
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_app_role_check;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS app_role text NOT NULL DEFAULT 'user';

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_app_role_check
  CHECK (app_role IN ('user', 'admin', 'safety_team'));

CREATE INDEX IF NOT EXISTS user_profiles_app_role_idx
  ON public.user_profiles (app_role)
  WHERE app_role <> 'user';

-- -----------------------------------------------------------------------------
-- 2. Emergency contacts (replaces the single legacy emergency_contact field)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  relationship text,
  is_primary boolean NOT NULL DEFAULT false,
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT emergency_contacts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  CONSTRAINT emergency_contacts_phone_present
    CHECK (phone IS NOT NULL OR email IS NOT NULL),
  CONSTRAINT emergency_contacts_user_phone_unique UNIQUE (user_id, phone)
);

CREATE INDEX IF NOT EXISTS emergency_contacts_user_idx
  ON public.emergency_contacts (user_id, is_primary DESC, created_at);

-- Migrate the legacy single-field contact into the new table (idempotent).
INSERT INTO public.emergency_contacts (user_id, name, phone, is_primary, verified)
SELECT
  p.id,
  COALESCE(NULLIF(btrim(p.name), ''), 'Emergency contact'),
  p.emergency_contact,
  true,
  false
FROM public.user_profiles p
WHERE p.emergency_contact IS NOT NULL
  AND btrim(p.emergency_contact) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.emergency_contacts ec WHERE ec.user_id = p.id
  );

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS emergency_contacts_set_updated_at ON public.emergency_contacts;
CREATE TRIGGER emergency_contacts_set_updated_at
BEFORE UPDATE ON public.emergency_contacts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. SOS incidents
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sos_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code text NOT NULL,
  user_id text NOT NULL,
  current_ride_id uuid REFERENCES public.rides(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  activation_source text NOT NULL DEFAULT 'app',
  -- Location captured at the moment of activation
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  -- Rolling "last known" position updated by every location ping
  last_latitude double precision,
  last_longitude double precision,
  last_accuracy double precision,
  last_location_at timestamptz,
  last_location_source text,
  -- Location ping accounting
  location_ping_count integer NOT NULL DEFAULT 0,
  -- What this device was actually able to collect (honest capability report)
  evidence_capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_last_cycle_at timestamptz,
  evidence_photo_count integer NOT NULL DEFAULT 0,
  evidence_audio_count integer NOT NULL DEFAULT 0,
  contacts_notified integer NOT NULL DEFAULT 0,
  contacts_total integer NOT NULL DEFAULT 0,
  activated_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  end_reason text,
  ended_by text,
  acknowledged_at timestamptz,
  acknowledged_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sos_incidents_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  CONSTRAINT sos_incidents_status_check
    CHECK (status IN ('ACTIVE', 'RESOLVED', 'CANCELLED')),
  CONSTRAINT sos_incidents_coordinates_present
    CHECK (latitude IS NULL OR longitude IS NULL OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)),
  CONSTRAINT sos_incidents_reference_unique UNIQUE (reference_code)
);

CREATE INDEX IF NOT EXISTS sos_incidents_user_status_idx
  ON public.sos_incidents (user_id, status, activated_at DESC);
CREATE INDEX IF NOT EXISTS sos_incidents_active_idx
  ON public.sos_incidents (activated_at DESC)
  WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS sos_incidents_status_idx
  ON public.sos_incidents (status, activated_at DESC);
CREATE INDEX IF NOT EXISTS sos_incidents_location_idx
  ON public.sos_incidents (id) INCLUDE (last_latitude, last_longitude, last_location_at);

DROP TRIGGER IF EXISTS sos_incidents_set_updated_at ON public.sos_incidents;
CREATE TRIGGER sos_incidents_set_updated_at
BEFORE UPDATE ON public.sos_incidents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Only one ACTIVE incident per user at a time (partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS sos_incidents_one_active_per_user
  ON public.sos_incidents (user_id)
  WHERE status = 'ACTIVE';

-- -----------------------------------------------------------------------------
-- 4. SOS location history
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sos_locations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sos_id uuid NOT NULL,
  user_id text NOT NULL,
  sequence integer NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision,
  altitude double precision,
  speed double precision,
  heading double precision,
  source text NOT NULL DEFAULT 'foreground',
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sos_locations_sos_id_fkey
    FOREIGN KEY (sos_id) REFERENCES public.sos_incidents(id) ON DELETE CASCADE,
  CONSTRAINT sos_locations_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  CONSTRAINT sos_locations_sequence_unique UNIQUE (sos_id, sequence),
  CONSTRAINT sos_coordinates_valid
    CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180),
  CONSTRAINT sos_locations_source_check
    CHECK (source IN ('foreground', 'background', 'manual'))
);

CREATE INDEX IF NOT EXISTS sos_locations_sos_time_idx
  ON public.sos_locations (sos_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS sos_locations_sos_seq_idx
  ON public.sos_locations (sos_id, sequence DESC);

-- -----------------------------------------------------------------------------
-- 5. SOS evidence (photos + audio)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sos_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sos_id uuid NOT NULL,
  user_id text NOT NULL,
  kind text NOT NULL,
  sequence integer NOT NULL,
  storage_path text NOT NULL,
  captured_at timestamptz NOT NULL,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  -- How this item was actually obtained. Never claim background capture that
  -- did not happen: 'background_native' is only written by a native module.
  capture_mode text NOT NULL DEFAULT 'foreground',
  byte_size bigint,
  content_type text,
  status text NOT NULL DEFAULT 'PENDING',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sos_evidence_sos_id_fkey
    FOREIGN KEY (sos_id) REFERENCES public.sos_incidents(id) ON DELETE CASCADE,
  CONSTRAINT sos_evidence_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  CONSTRAINT sos_evidence_kind_check CHECK (kind IN ('photo', 'audio')),
  CONSTRAINT sos_evidence_sequence_unique UNIQUE (sos_id, kind, sequence),
  CONSTRAINT sos_evidence_capture_mode_check
    CHECK (capture_mode IN ('foreground', 'foreground_interactive', 'background_native')),
  CONSTRAINT sos_evidence_status_check
    CHECK (status IN ('PENDING', 'UPLOADED', 'FAILED', 'SKIPPED_UNAVAILABLE')),
  CONSTRAINT sos_evidence_path_unique UNIQUE (storage_path)
);

CREATE INDEX IF NOT EXISTS sos_evidence_sos_idx
  ON public.sos_evidence (sos_id, kind, sequence);
CREATE INDEX IF NOT EXISTS sos_evidence_pending_idx
  ON public.sos_evidence (sos_id) WHERE status IN ('PENDING', 'FAILED');

DROP TRIGGER IF EXISTS sos_evidence_set_updated_at ON public.sos_evidence;
CREATE TRIGGER sos_evidence_set_updated_at
BEFORE UPDATE ON public.sos_evidence
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 6. Per-contact dispatch record
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sos_contact_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sos_id uuid NOT NULL,
  user_id text NOT NULL,
  contact_id uuid REFERENCES public.emergency_contacts(id) ON DELETE SET NULL,
  contact_name text NOT NULL,
  contact_phone text,
  contact_email text,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING_PROVIDER',
  provider text,
  provider_message_id text,
  provider_error text,
  maps_url text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sos_contact_alerts_sos_id_fkey
    FOREIGN KEY (sos_id) REFERENCES public.sos_incidents(id) ON DELETE CASCADE,
  CONSTRAINT sos_contact_alerts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  CONSTRAINT sos_contact_alerts_channel_check
    CHECK (channel IN ('sms', 'email', 'app')),
  CONSTRAINT sos_contact_alerts_status_check
    CHECK (status IN ('PENDING_PROVIDER', 'SENT', 'FAILED', 'SKIPPED_NO_PROVIDER', 'SKIPPED_NO_REACH'))
);

CREATE INDEX IF NOT EXISTS sos_contact_alerts_sos_idx
  ON public.sos_contact_alerts (sos_id, attempted_at DESC);

DROP TRIGGER IF EXISTS sos_contact_alerts_set_updated_at ON public.sos_contact_alerts;
CREATE TRIGGER sos_contact_alerts_set_updated_at
BEFORE UPDATE ON public.sos_contact_alerts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 7. Incidents may only end once
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_sos_incident_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'ACTIVE' AND NEW.status <> 'ACTIVE' THEN
    IF NEW.ended_at IS NULL THEN NEW.ended_at = now(); END IF;
  END IF;

  IF OLD.status <> 'ACTIVE' AND NEW.status = 'ACTIVE' THEN
    RAISE EXCEPTION 'SOS incident % is already % and cannot be reactivated',
      OLD.reference_code, OLD.status
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sos_incidents_guard_transition ON public.sos_incidents;
CREATE TRIGGER sos_incidents_guard_transition
BEFORE UPDATE ON public.sos_incidents
FOR EACH ROW EXECUTE FUNCTION public.guard_sos_incident_transition();

-- -----------------------------------------------------------------------------
-- 8. Admin helper
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_sos_operator(p_user_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = p_user_id AND app_role IN ('admin', 'safety_team')
  );
$$;

-- Best-effort current ride resolution for a user (owned ride, else none).
CREATE OR REPLACE FUNCTION public.find_user_current_ride(p_user_id text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id
  FROM public.rides r
  WHERE r.user_id = p_user_id
    AND r.status IN ('active', 'confirmed')
    AND (r.travel_date IS NULL OR r.travel_date >= current_date - 1)
  ORDER BY (r.travel_date IS NULL) ASC, r.travel_date ASC NULLS LAST, r.created_at DESC
  LIMIT 1;
$$;

-- -----------------------------------------------------------------------------
-- 9. Private evidence storage bucket
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'sos-evidence') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'sos-evidence',
      'sos-evidence',
      false,
      26214400,
      ARRAY['image/jpeg', 'image/png', 'image/heic', 'audio/m4a', 'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/ogg']
    );
  ELSE
    -- Force private + sane limits if the bucket already existed.
    UPDATE storage.buckets
    SET public = false,
        file_size_limit = 26214400,
        allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/heic', 'audio/m4a', 'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/ogg']
    WHERE id = 'sos-evidence';
  END IF;
END;
$$;

-- No storage.objects policies are created: the bucket is service-role only.
-- Clients upload via short-lived signed upload URLs minted by an Edge Function.

-- -----------------------------------------------------------------------------
-- 10. RLS + grants
-- -----------------------------------------------------------------------------
ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_contact_alerts ENABLE ROW LEVEL SECURITY;

-- Emergency contacts remain manageable by the client (same bootstrap posture the
-- app already uses for user_profiles). SOS tables get NO client access at all.
REVOKE ALL ON public.sos_incidents FROM anon, authenticated;
REVOKE ALL ON public.sos_locations FROM anon, authenticated;
REVOKE ALL ON public.sos_evidence FROM anon, authenticated;
REVOKE ALL ON public.sos_contact_alerts FROM anon, authenticated;

GRANT ALL ON public.sos_incidents TO service_role;
GRANT ALL ON public.sos_locations TO service_role;
GRANT ALL ON public.sos_evidence TO service_role;
GRANT ALL ON public.sos_contact_alerts TO service_role;
GRANT ALL ON public.emergency_contacts TO service_role;

-- Helper functions are service-role only; the client never calls them directly.
REVOKE ALL ON FUNCTION public.is_sos_operator(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_user_current_ride(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_sos_operator(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.find_user_current_ride(text) TO service_role;

COMMIT;
