-- Structured, coordinate-aware locations for fast pickup/drop selection.
-- Apply this migration before using the progressive location flow in production.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS home_address text,
  ADD COLUMN IF NOT EXISTS office_address text,
  ADD COLUMN IF NOT EXISTS college_address text,
  ADD COLUMN IF NOT EXISTS saved_locations jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.user_profiles.saved_locations IS
  'Saved places: home, office, college, defaultPickup, and defaultDrop. Each place includes label, address, latitude, longitude, and updatedAt.';
