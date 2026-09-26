-- =============================================================================
-- Multi-seat acceptance
--
-- PROBLEM
--   respond_to_ride_request() was written for a one-seat ride. On the first
--   acceptance it set the ride to 'confirmed' and cancelled every other pending
--   request:
--
--       status = 'confirmed'
--       ...
--       UPDATE ride_requests SET status = 'cancelled' ... WHERE status = 'pending';
--
--   So a rider who posted 3 seats and received 5 requests lost the other 4 the
--   moment they accepted one, and the post closed with 2 seats still empty.
--
-- FIX
--   A ride now closes only when its last seat is taken. Pending requests are
--   cancelled only at that point, and declining never changes the seat count.
--
--   Works for both flows:
--     rider  - available_seats is the free seats in their vehicle
--     seeker - available_seats is the people still waiting to be collected
--              (a ride with vehicle_kind IS NULL)
--
--   The notification trigger is unaffected: it only fires for 'pending',
--   'accepted' and 'declined', so the final bulk cancel stays silent.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.respond_to_ride_request(
  p_request_id uuid,
  p_owner_id text,
  p_decision text
)
RETURNS public.ride_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_request public.ride_requests%ROWTYPE;
  v_ride public.rides%ROWTYPE;
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_updated public.ride_requests%ROWTYPE;
BEGIN
  IF p_owner_id IS NULL OR btrim(p_owner_id) = '' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF v_decision NOT IN ('accepted', 'declined') THEN
    RAISE EXCEPTION 'Decision must be accepted or declined' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_request
  FROM public.ride_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ride request not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_ride
  FROM public.rides
  WHERE id = v_request.ride_id
  FOR UPDATE;

  IF v_ride.user_id <> p_owner_id OR v_request.owner_id <> p_owner_id THEN
    RAISE EXCEPTION 'Only the ride owner can respond to this request' USING ERRCODE = '42501';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been %', v_request.status USING ERRCODE = '22023';
  END IF;

  IF v_decision = 'accepted' THEN
    IF v_ride.status <> 'active' OR v_ride.available_seats <= 0 THEN
      RAISE EXCEPTION 'This ride cannot accept another passenger' USING ERRCODE = '22023';
    END IF;

    UPDATE public.ride_requests
    SET status = 'accepted',
        responded_at = now()
    WHERE id = p_request_id
    RETURNING * INTO v_updated;

    -- Take the seat, and close the ride only when the last one is gone.
    UPDATE public.rides
    SET occupied_seats = occupied_seats + 1,
        available_seats = available_seats - 1,
        status = CASE WHEN available_seats - 1 <= 0 THEN 'confirmed' ELSE 'active' END
    WHERE id = v_ride.id
    RETURNING * INTO v_ride;

    -- Only once the ride is genuinely full is there nothing left to accept.
    IF v_ride.available_seats <= 0 THEN
      UPDATE public.ride_requests
      SET status = 'cancelled',
          responded_at = now()
      WHERE ride_id = v_ride.id
        AND id <> p_request_id
        AND status = 'pending';
    END IF;
  ELSE
    -- Declining frees nothing and closes nothing.
    UPDATE public.ride_requests
    SET status = 'declined',
        responded_at = now()
    WHERE id = p_request_id
    RETURNING * INTO v_updated;
  END IF;

  UPDATE public.notifications
  SET read_at = now()
  WHERE request_id = p_request_id
    AND recipient_id = p_owner_id
    AND read_at IS NULL;

  UPDATE public.notifications
  SET read_at = now()
  WHERE request_id IN (
    SELECT id
    FROM public.ride_requests
    WHERE ride_id = v_ride.id
      AND status = 'cancelled'
  )
    AND recipient_id = p_owner_id
    AND read_at IS NULL;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_ride_request(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_ride_request(uuid, text, text) TO anon, authenticated;

COMMIT;
