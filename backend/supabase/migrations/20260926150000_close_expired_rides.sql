-- =============================================================================
-- Close scheduled rides once their date and time have passed
--
-- A planned ride is only meaningful up to its departure. After that the post
-- must stop taking requests and the owner must be told why, even when every seat
-- was filled and nothing went wrong.
--
-- Two parts:
--   1. close_expired_rides()  - closes anything past its departure and notifies
--                               the owner, skipping rows it already notified so
--                               a run cannot spam the same person.
--   2. a pg_cron schedule      - runs it every 15 minutes.
--
-- A ride with no travel_date or no travel_time is open-ended and never closes.
-- Only 'active' and 'confirmed' posts are touched; drafts are left alone.
--
-- The client also detects this on load, so the post shows as closed immediately
-- rather than waiting for the next cron tick. This function is the authoritative
-- version that stops the post appearing in search results for anyone else.
-- =============================================================================

BEGIN;

-- The existing CHECK on notifications.type does not include 'ride_closed', so
-- the insert below would be rejected. Widen it first, keeping the original
-- values valid.
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'ride_request',
    'request_accepted',
    'request_declined',
    'ride_closed',
    'system'
  ));

CREATE OR REPLACE FUNCTION public.close_expired_rides()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_closed integer := 0;
BEGIN
  WITH expired AS (
    UPDATE public.rides
    SET status = 'cancelled',
        updated_at = now()
    WHERE status IN ('active', 'confirmed')
      AND travel_date IS NOT NULL
      AND travel_time IS NOT NULL
      AND (travel_date + travel_time) <= now()
    RETURNING id, user_id, pickup_address, dropoff_address
  )
  INSERT INTO public.notifications (
    recipient_id,
    actor_id,
    type,
    title,
    body,
    ride_id,
    metadata
  )
  SELECT
    e.user_id,
    e.user_id,
    'ride_closed',
    'Your ride post is closed',
    trim(coalesce(e.pickup_address, 'Pickup') || ' → ' || coalesce(e.dropoff_address, 'Drop'))
      || ' closed because the selected date and time have passed.',
    e.id,
    jsonb_build_object('reason', 'date_passed')
  FROM expired e
  WHERE NOT EXISTS (
    -- One notice per ride, so repeated runs do not pile up duplicates.
    SELECT 1
    FROM public.notifications n
    WHERE n.ride_id = e.id
      AND n.type = 'ride_closed'
  );

  GET DIAGNOSTICS v_closed = ROW_COUNT;
  RETURN v_closed;
END;
$$;

REVOKE ALL ON FUNCTION public.close_expired_rides() FROM PUBLIC;

-- Hourly is plenty: the client closes the post in the owner's own view straight
-- away, and this is what keeps it out of everyone else's search results.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'close-expired-rides') THEN
      PERFORM cron.schedule('close-expired-rides', '7 * * * *', 'SELECT public.close_expired_rides()');
    END IF;
  END IF;
END;
$$;

COMMIT;
