-- LinQ ride requests, notifications, and confirmed rides
-- Apply after supabase_schema.sql on an existing fresh project.

BEGIN;

-- A ride becomes confirmed when the owner accepts a passenger request.
ALTER TABLE public.rides
  DROP CONSTRAINT IF EXISTS rides_status_check;

ALTER TABLE public.rides
  ADD CONSTRAINT rides_status_check
  CHECK (status IN ('active', 'confirmed', 'completed', 'cancelled'));

CREATE TABLE IF NOT EXISTS public.ride_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL,
  owner_id text NOT NULL,
  requester_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ride_requests_ride_id_fkey
    FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE CASCADE,
  CONSTRAINT ride_requests_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  CONSTRAINT ride_requests_requester_id_fkey
    FOREIGN KEY (requester_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  CONSTRAINT ride_requests_requester_not_owner CHECK (owner_id <> requester_id),
  CONSTRAINT ride_requests_ride_requester_unique UNIQUE (ride_id, requester_id)
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id text NOT NULL,
  actor_id text,
  type text NOT NULL
    CHECK (type IN (
      'ride_request',
      'request_accepted',
      'request_declined',
      'system'
    )),
  title text NOT NULL,
  body text NOT NULL,
  ride_id uuid REFERENCES public.rides(id) ON DELETE CASCADE,
  request_id uuid REFERENCES public.ride_requests(id) ON DELETE CASCADE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_recipient_id_fkey
    FOREIGN KEY (recipient_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  CONSTRAINT notifications_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ride_requests_owner_status_idx
  ON public.ride_requests (owner_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ride_requests_requester_status_idx
  ON public.ride_requests (requester_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ride_requests_ride_status_idx
  ON public.ride_requests (ride_id, status);
CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
  ON public.notifications (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON public.notifications (recipient_id, created_at DESC)
  WHERE read_at IS NULL;

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

DROP TRIGGER IF EXISTS ride_requests_set_updated_at ON public.ride_requests;
CREATE TRIGGER ride_requests_set_updated_at
BEFORE UPDATE ON public.ride_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS notifications_set_updated_at ON public.notifications;
CREATE TRIGGER notifications_set_updated_at
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Create notifications for new/pending requests and accepted/declined results.
CREATE OR REPLACE FUNCTION public.handle_ride_request_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor_name text;
  v_ride_pickup text;
  v_ride_dropoff text;
  v_route text;
BEGIN
  v_actor_name := 'A rider';
  SELECT name INTO v_actor_name
  FROM public.user_profiles
  WHERE id = NEW.requester_id;

  SELECT pickup_address, dropoff_address
  INTO v_ride_pickup, v_ride_dropoff
  FROM public.rides
  WHERE id = NEW.ride_id;

  v_route := trim(coalesce(v_ride_pickup, 'Pickup') || ' → ' || coalesce(v_ride_dropoff, 'Drop'));

  IF (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'pending')
     AND NEW.status = 'pending' THEN
    INSERT INTO public.notifications (
      recipient_id,
      actor_id,
      type,
      title,
      body,
      ride_id,
      request_id,
      metadata
    ) VALUES (
      NEW.owner_id,
      NEW.requester_id,
      'ride_request',
      coalesce(v_actor_name, 'A rider') || ' requested to join your ride',
      v_route,
      NEW.ride_id,
      NEW.id,
      jsonb_build_object('status', NEW.status)
    );
  ELSIF OLD.status IS DISTINCT FROM NEW.status
        AND NEW.status IN ('accepted', 'declined') THEN
    INSERT INTO public.notifications (
      recipient_id,
      actor_id,
      type,
      title,
      body,
      ride_id,
      request_id,
      metadata
    ) VALUES (
      NEW.requester_id,
      NEW.owner_id,
      CASE WHEN NEW.status = 'accepted'
        THEN 'request_accepted'
        ELSE 'request_declined'
      END,
      CASE WHEN NEW.status = 'accepted'
        THEN 'Your ride request was accepted'
        ELSE 'Your ride request was declined'
      END,
      v_route,
      NEW.ride_id,
      NEW.id,
      jsonb_build_object('status', NEW.status)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ride_request_notification_trigger ON public.ride_requests;
CREATE TRIGGER ride_request_notification_trigger
AFTER INSERT OR UPDATE OF status ON public.ride_requests
FOR EACH ROW EXECUTE FUNCTION public.handle_ride_request_notification();

-- Create or re-open a request for a ride.
CREATE OR REPLACE FUNCTION public.request_ride(
  p_ride_id uuid,
  p_requester_id text
)
RETURNS public.ride_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ride public.rides%ROWTYPE;
  v_existing public.ride_requests%ROWTYPE;
  v_request public.ride_requests%ROWTYPE;
BEGIN
  IF p_requester_id IS NULL OR btrim(p_requester_id) = '' THEN
    RAISE EXCEPTION 'A signed-in rider is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_ride
  FROM public.rides
  WHERE id = p_ride_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ride not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_ride.user_id = p_requester_id THEN
    RAISE EXCEPTION 'You cannot request your own ride' USING ERRCODE = '22023';
  END IF;

  IF v_ride.status <> 'active' OR v_ride.available_seats <= 0 THEN
    RAISE EXCEPTION 'This ride is not accepting requests' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.ride_requests
  WHERE ride_id = p_ride_id
    AND requester_id = p_requester_id
  FOR UPDATE;

  IF FOUND AND v_existing.status IN ('pending', 'accepted') THEN
    RAISE EXCEPTION 'You already have a % request for this ride', v_existing.status
      USING ERRCODE = '23505';
  END IF;

  IF FOUND THEN
    UPDATE public.ride_requests
    SET status = 'pending',
        responded_at = NULL
    WHERE id = v_existing.id
    RETURNING * INTO v_request;
  ELSE
    INSERT INTO public.ride_requests (
      ride_id,
      owner_id,
      requester_id,
      status
    ) VALUES (
      p_ride_id,
      v_ride.user_id,
      p_requester_id,
      'pending'
    )
    RETURNING * INTO v_request;
  END IF;

  RETURN v_request;
END;
$$;

-- Accept or decline an incoming request. The owner id is validated against
-- the ride row; replace this with verified Firebase/Supabase auth in production.
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

    UPDATE public.rides
    SET occupied_seats = occupied_seats + 1,
        available_seats = available_seats - 1,
        status = 'confirmed'
    WHERE id = v_ride.id;

    -- One accepted passenger confirms the posted ride. Close other requests.
    UPDATE public.ride_requests
    SET status = 'cancelled',
        responded_at = now()
    WHERE ride_id = v_ride.id
      AND id <> p_request_id
      AND status = 'pending';
  ELSE
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

ALTER TABLE public.ride_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- The app currently uses Firebase UIDs with the anon Supabase client. These
-- read policies match the existing bootstrap model. Replace them with
-- server-verified user policies before production.
DROP POLICY IF EXISTS ride_requests_client_read ON public.ride_requests;
CREATE POLICY ride_requests_client_read
  ON public.ride_requests
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS notifications_client_read ON public.notifications;
CREATE POLICY notifications_client_read
  ON public.notifications
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS notifications_client_update_read ON public.notifications;
CREATE POLICY notifications_client_update_read
  ON public.notifications
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.ride_requests FROM anon, authenticated;
GRANT SELECT ON public.ride_requests TO anon, authenticated;
GRANT SELECT, UPDATE (read_at) ON public.notifications TO anon, authenticated;

REVOKE ALL ON FUNCTION public.request_ride(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_to_ride_request(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_ride(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_ride_request(uuid, text, text) TO anon, authenticated;

-- Realtime keeps notification counts and request actions synchronized.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ride_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_requests;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END;
$$;

COMMIT;
