-- LinQ fresh Supabase schema
-- Run this file once in the SQL Editor of a NEW Supabase project.
-- It is intentionally a complete bootstrap; do not run the older migration
-- files separately after running this file.

BEGIN;

-- Extensions used by the application.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

SET LOCAL search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- User profiles
-- IDs are Firebase UIDs, so auth.uid() is not used by the current client.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id text PRIMARY KEY,
  name text,
  age integer CHECK (age IS NULL OR age BETWEEN 1 AND 120),
  gender text CHECK (gender IS NULL OR gender IN ('female', 'male', 'other')),
  women_only_mode boolean NOT NULL DEFAULT false,
  bio text CHECK (bio IS NULL OR char_length(bio) <= 120),
  phone_number text,
  email text,
  avatar_url text,
  rating numeric(3, 2) CHECK (rating IS NULL OR rating BETWEEN 0 AND 5),
  total_trips integer NOT NULL DEFAULT 0 CHECK (total_trips >= 0),
  co2_saved_kg numeric(12, 3) NOT NULL DEFAULT 0 CHECK (co2_saved_kg >= 0),
  verification_status text NOT NULL DEFAULT 'not_verified'
    CHECK (verification_status IN ('not_verified', 'pending', 'verified')),
  verification_document text
    CHECK (verification_document IS NULL OR verification_document IN ('aadhaar', 'pan', 'dl')),
  emergency_contact text,
  home_address text,
  office_address text,
  college_address text,
  saved_locations jsonb NOT NULL DEFAULT '{}'::jsonb,
  kyc_status text NOT NULL DEFAULT 'not_verified'
    CHECK (kyc_status IN ('not_verified', 'pending', 'verified')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_profiles IS
  'Application user profiles keyed by Firebase UID.';
COMMENT ON COLUMN public.user_profiles.saved_locations IS
  'JSON object containing home, office, college, defaultPickup, and defaultDrop locations.';

-- ---------------------------------------------------------------------------
-- Rides
-- pickup/drop locations use PostGIS geography points (longitude, latitude).
-- route_geom stores the actual road geometry used by route matching.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  ride_type text NOT NULL CHECK (ride_type IN ('instant', 'daily', 'planned')),

  pickup_location geography(POINT, 4326) NOT NULL,
  dropoff_location geography(POINT, 4326) NOT NULL,
  pickup_address text NOT NULL,
  dropoff_address text NOT NULL,

  travel_time time,
  return_time time,
  travel_date date,
  selected_days smallint[],

  available_seats integer NOT NULL DEFAULT 6 CHECK (available_seats >= 0),
  occupied_seats integer NOT NULL DEFAULT 1 CHECK (occupied_seats >= 0),
  price_per_seat numeric(10, 2) CHECK (price_per_seat IS NULL OR price_per_seat >= 0),
  women_only boolean NOT NULL DEFAULT false,

  vehicle_kind text CHECK (vehicle_kind IS NULL OR vehicle_kind IN ('car', 'bike', 'auto', 'cab')),
  vehicle_model text,
  vehicle_plate text,

  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled')),
  route_polyline text,
  route_geom geography(LINESTRING, 4326),
  total_distance_meters integer CHECK (total_distance_meters IS NULL OR total_distance_meters >= 0),
  total_duration_seconds integer CHECK (total_duration_seconds IS NULL OR total_duration_seconds >= 0),
  co2_saved_kg numeric(12, 3) CHECK (co2_saved_kg IS NULL OR co2_saved_kg >= 0),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rides IS
  'Ride postings with PostGIS pickup/drop points and optional OSRM route geometry.';
COMMENT ON COLUMN public.rides.route_polyline IS
  'Encoded road polyline consumed by the match-rides Edge Function.';
COMMENT ON COLUMN public.rides.route_geom IS
  'PostGIS LineString of the actual road route used for spatial matching.';

-- ---------------------------------------------------------------------------
-- Payments
-- The FastAPI backend creates a `created` row and changes it to `verified`
-- only after Razorpay signature verification succeeds.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  razorpay_order_id text NOT NULL UNIQUE,
  razorpay_payment_id text UNIQUE,
  receipt text NOT NULL UNIQUE,
  amount integer NOT NULL CHECK (amount >= 100),
  currency text NOT NULL DEFAULT 'INR',
  product text,
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'verified', 'failed', 'refunded', 'cancelled')),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.payments IS
  'Razorpay orders and server-verified payments; client roles have no direct access.';

-- ---------------------------------------------------------------------------
-- Automatic updated_at maintenance
-- ---------------------------------------------------------------------------
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

DROP TRIGGER IF EXISTS user_profiles_set_updated_at ON public.user_profiles;
CREATE TRIGGER user_profiles_set_updated_at
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS rides_set_updated_at ON public.rides;
CREATE TRIGGER rides_set_updated_at
BEFORE UPDATE ON public.rides
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS payments_set_updated_at ON public.payments;
CREATE TRIGGER payments_set_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS user_profiles_phone_idx
  ON public.user_profiles (phone_number);
CREATE INDEX IF NOT EXISTS rides_user_status_idx
  ON public.rides (user_id, status);
CREATE INDEX IF NOT EXISTS rides_type_status_idx
  ON public.rides (ride_type, status);
CREATE INDEX IF NOT EXISTS rides_pickup_geom_idx
  ON public.rides USING GIST (pickup_location);
CREATE INDEX IF NOT EXISTS rides_dropoff_geom_idx
  ON public.rides USING GIST (dropoff_location);
CREATE INDEX IF NOT EXISTS rides_route_geom_idx
  ON public.rides USING GIST (route_geom);

-- ---------------------------------------------------------------------------
-- Nearby ride RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_nearby_rides(
  user_lon double precision,
  user_lat double precision,
  radius_meters double precision DEFAULT 25000
)
RETURNS SETOF public.rides
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  origin geography(POINT, 4326) := ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography;
BEGIN
  RETURN QUERY
  SELECT r.*
  FROM public.rides AS r
  WHERE r.status = 'active'
    AND ST_DWithin(r.pickup_location, origin, radius_meters)
  ORDER BY r.pickup_location <-> origin;
END;
$$;

-- ---------------------------------------------------------------------------
-- Route-aware candidate RPC used by backend/supabase/functions/match-rides
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_candidate_rides(
  passenger_pickup_lon double precision,
  passenger_pickup_lat double precision,
  passenger_dropoff_lon double precision,
  passenger_dropoff_lat double precision,
  max_deviation_meters double precision DEFAULT 5000
)
RETURNS SETOF public.rides
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  passenger_origin geography(POINT, 4326) :=
    ST_SetSRID(ST_MakePoint(passenger_pickup_lon, passenger_pickup_lat), 4326)::geography;
  passenger_destination geography(POINT, 4326) :=
    ST_SetSRID(ST_MakePoint(passenger_dropoff_lon, passenger_dropoff_lat), 4326)::geography;
BEGIN
  RETURN QUERY
  SELECT r.*
  FROM public.rides AS r
  WHERE r.status = 'active'
    AND r.available_seats > 0
    AND r.route_geom IS NOT NULL
    AND ST_DWithin(r.route_geom, passenger_origin, max_deviation_meters)
    AND ST_DWithin(r.route_geom, passenger_destination, max_deviation_meters)
  ORDER BY r.route_geom <-> passenger_origin;
END;
$$;

-- ---------------------------------------------------------------------------
-- Client access
-- The current app authenticates with Firebase but writes profiles with the
-- Supabase anon client. These permissive policies keep that current client
-- functional. Replace them with server-verified policies before production.
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides TO anon, authenticated;
REVOKE ALL ON public.payments FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payments TO service_role;
GRANT EXECUTE ON FUNCTION public.find_nearby_rides(double precision, double precision, double precision)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_candidate_rides(double precision, double precision, double precision, double precision, double precision)
  TO anon, authenticated;

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_profiles_client_access ON public.user_profiles;
CREATE POLICY user_profiles_client_access
  ON public.user_profiles
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS rides_client_access ON public.rides;
CREATE POLICY rides_client_access
  ON public.rides
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;
