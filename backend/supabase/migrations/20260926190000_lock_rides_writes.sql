-- =============================================================================
-- Lock down client writes to rides
--
-- rides_client_access is FOR ALL ... USING (true) WITH CHECK (true), and the
-- anon role holds blanket UPDATE/DELETE on public.rides. Combined with an
-- app that has no auth.uid() (Firebase UIDs), a client holding the public anon
-- key can PATCH or DELETE any ride in the table, not just its own.
--
-- WHAT THIS CLOSES
--   Two columns are now unwritable by the client:
--
--     user_id          Ownership can no longer be reassigned. A client could
--                      otherwise move its own ride onto someone else's profile,
--                      or dump a ride on another rider to shed responsibility.
--                      Never updated by the app; only set on INSERT.
--
--     occupied_seats   Derived state, owned by respond_to_ride_request(). With
--                      it writable, a client could inflate or zero a seat count
--                      directly and bypass the accept/decline flow entirely.
--                      Never updated by the app.
--
--   Column-level UPDATE grants replace the blanket one, matching the pattern
--   already used for user_profiles in 20260925150000.
--
-- WHAT THIS DOES NOT CLOSE
--   Identity is still self-asserted. The app passes the caller's own id and the
--   database has no way to verify it, so a malicious client can still pass
--   someone else's id to request_ride or respond_to_ride_request. RLS cannot
--   fix that without auth.uid(); it needs a move to Supabase Auth. Until then
--   these grants raise the cost of a raw REST call but are not a boundary.
--
-- DELETE is deliberately left granted: the app's own delete paths
-- (deleteRide, deleteOwnRide) go straight through PostgREST rather than a
-- function, and narrowing that is a separate change.
-- =============================================================================

BEGIN;

REVOKE UPDATE ON public.rides FROM anon, authenticated;

-- Columns the LinQ client legitimately updates. user_id and occupied_seats are
-- deliberately absent.
GRANT UPDATE (
  ride_type,
  pickup_location,
  dropoff_location,
  pickup_address,
  dropoff_address,
  travel_time,
  return_time,
  travel_date,
  selected_days,
  available_seats,
  price_per_seat,
  women_only,
  vehicle_kind,
  vehicle_model,
  vehicle_plate,
  status,
  co2_saved_kg,
  total_distance_meters,
  total_duration_seconds
) ON public.rides TO anon, authenticated;

-- service_role bypasses RLS and keeps full access.
GRANT ALL ON public.rides TO service_role;

-- Belt and braces on seat integrity: occupied + available can never go negative,
-- so a hand-crafted update cannot manufacture extra seats even via a function.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rides_seat_totals_check'
      AND conrelid = 'public.rides'::regclass
  ) THEN
    ALTER TABLE public.rides
      ADD CONSTRAINT rides_seat_totals_check
      CHECK (
        (available_seats IS NULL OR available_seats >= 0)
        AND (occupied_seats IS NULL OR occupied_seats >= 0)
        AND (available_seats IS NULL OR occupied_seats IS NULL
             OR available_seats + occupied_seats >= 0)
      );
  END IF;
END;
$$;

COMMIT;
