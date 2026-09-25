-- =============================================================================
-- Draft rides.
--
-- Rides previously had no draft state: publishing always created an ACTIVE
-- ride, so "save for later" had nowhere to live. Drafts are stored in the same
-- table (not a separate one) so a draft becomes a real ride by a single status
-- change rather than a copy, and so drafts never appear in search or matching.
-- =============================================================================

BEGIN;

ALTER TABLE public.rides
  DROP CONSTRAINT IF EXISTS rides_status_check;

ALTER TABLE public.rides
  ADD CONSTRAINT rides_status_check
  CHECK (status IN ('draft', 'active', 'confirmed', 'completed', 'cancelled'));

-- Drafts are excluded from every discovery/matching query.
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
BEGIN
  RETURN QUERY
  SELECT r.*
  FROM public.rides r
  WHERE r.status = 'active'
    AND r.available_seats > 0
    AND ST_DWithin(
      r.pickup_location::geography,
      ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography,
      radius_meters
    )
  ORDER BY r.pickup_location <-> ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography;
END;
$$;

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
BEGIN
  RETURN QUERY
  SELECT r.*
  FROM public.rides r
  WHERE r.status = 'active'
    AND r.available_seats > 0
    AND r.route_geom IS NOT NULL
    AND ST_DWithin(
      r.pickup_location::geography,
      ST_SetSRID(ST_MakePoint(passenger_pickup_lon, passenger_pickup_lat), 4326)::geography,
      max_deviation_meters
    )
    AND ST_DWithin(
      r.dropoff_location::geography,
      ST_SetSRID(ST_MakePoint(passenger_dropoff_lon, passenger_dropoff_lat), 4326)::geography,
      max_deviation_meters
    )
  ORDER BY r.route_geom <-> ST_MakeLine(
    ST_SetSRID(ST_MakePoint(passenger_pickup_lon, passenger_pickup_lat), 4326),
    ST_SetSRID(ST_MakePoint(passenger_dropoff_lon, passenger_dropoff_lat), 4326)
  )::geography;
END;
$$;

CREATE INDEX IF NOT EXISTS rides_user_status_idx_v2
  ON public.rides (user_id, status, created_at DESC);

COMMIT;
