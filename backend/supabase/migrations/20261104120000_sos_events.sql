-- Reference-style SOS evidence events.
--
-- One row per SOS upload. Files live in the existing private `sos-evidence`
-- bucket under {user_id}/{sos_id}/. This table is a server-side audit record;
-- the mobile client reads it only through RLS-protected REST calls.

CREATE TABLE IF NOT EXISTS public.sos_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  sos_id text NOT NULL,
  "timestamp" timestamptz NOT NULL DEFAULT now(),
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  photo_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  video_path text,
  status text NOT NULL DEFAULT 'UPLOADED'
    CHECK (status IN ('UPLOADED', 'PARTIAL', 'EMPTY', 'FAILED')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sos_events_user_sos_unique UNIQUE (user_id, sos_id)
);

CREATE INDEX IF NOT EXISTS sos_events_user_created_idx
  ON public.sos_events (user_id, created_at DESC);

ALTER TABLE public.sos_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sos_events_select_own ON public.sos_events;
CREATE POLICY sos_events_select_own
  ON public.sos_events
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'sub') = user_id);

-- Writes are service-role only. The authenticated client may read its own
-- events, but cannot fabricate metadata rows or point at another user's paths.
REVOKE ALL ON public.sos_events FROM anon, authenticated;
GRANT SELECT ON public.sos_events TO authenticated;
GRANT ALL ON public.sos_events TO service_role;

-- The bucket already exists from 20260925140000_sos_safety.sql. Extend its
-- allow-list for the 5 second video while keeping it private and capped.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'sos-evidence') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'sos-evidence',
      'sos-evidence',
      false,
      26214400,
      ARRAY[
        'image/jpeg', 'image/png', 'image/heic',
        'video/mp4', 'video/quicktime',
        'audio/m4a', 'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/ogg'
      ]
    );
  ELSE
    UPDATE storage.buckets
    SET public = false,
        file_size_limit = 26214400,
        allowed_mime_types = ARRAY[
          'image/jpeg', 'image/png', 'image/heic',
          'video/mp4', 'video/quicktime',
          'audio/m4a', 'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/ogg'
        ]
    WHERE id = 'sos-evidence';
  END IF;
END;
$$;

-- Storage objects stay service-role only. The sos-upload function mints no
-- public URLs and performs every write/read with the service-role key.
