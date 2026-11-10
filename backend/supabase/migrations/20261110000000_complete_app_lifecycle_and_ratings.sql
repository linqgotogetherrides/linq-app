-- =============================================================================
-- Migration: Complete App Lifecycle, Connection Unlock, Ratings & RLS Hardening
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Fix add_co2_to_profile (change STABLE to VOLATILE and handle NULLs)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_co2_to_profile(
  p_user_id text,
  p_amount numeric
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_profiles
  SET co2_saved_kg = coalesce(co2_saved_kg, 0) + p_amount
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_co2_to_profile TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Ride Reviews & Ratings
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ride_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  reviewer_id text NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  reviewee_id text NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ride_reviews_unique_review UNIQUE(ride_id, reviewer_id, reviewee_id)
);

CREATE INDEX IF NOT EXISTS ride_reviews_reviewee_idx ON public.ride_reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS ride_reviews_ride_idx ON public.ride_reviews(ride_id);

ALTER TABLE public.ride_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ride_reviews_client_read ON public.ride_reviews;
CREATE POLICY ride_reviews_client_read ON public.ride_reviews
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS ride_reviews_client_insert ON public.ride_reviews;
CREATE POLICY ride_reviews_client_insert ON public.ride_reviews
  FOR INSERT TO anon, authenticated WITH CHECK (true);

GRANT SELECT, INSERT ON public.ride_reviews TO anon, authenticated;

-- RPC to submit a review and automatically update user's average rating
CREATE OR REPLACE FUNCTION public.submit_ride_review(
  p_ride_id uuid,
  p_reviewer_id text,
  p_reviewee_id text,
  p_rating integer,
  p_feedback text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_new_rating numeric(3, 2);
  v_review_id uuid;
BEGIN
  IF p_reviewer_id = p_reviewee_id THEN
    RAISE EXCEPTION 'You cannot rate yourself' USING ERRCODE = '22023';
  END IF;

  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ride_reviews (
    ride_id, reviewer_id, reviewee_id, rating, feedback
  ) VALUES (
    p_ride_id, p_reviewer_id, p_reviewee_id, p_rating, p_feedback
  )
  ON CONFLICT (ride_id, reviewer_id, reviewee_id)
  DO UPDATE SET rating = EXCLUDED.rating, feedback = EXCLUDED.feedback, created_at = now()
  RETURNING id INTO v_review_id;

  -- Recompute average rating for reviewee
  SELECT round(avg(rating)::numeric, 2)
  INTO v_new_rating
  FROM public.ride_reviews
  WHERE reviewee_id = p_reviewee_id;

  UPDATE public.user_profiles
  SET rating = v_new_rating
  WHERE id = p_reviewee_id;

  RETURN jsonb_build_object(
    'ok', true,
    'review_id', v_review_id,
    'new_average_rating', v_new_rating
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_ride_review TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Contact Unlock & Connection Fee
-- -----------------------------------------------------------------------------
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS contact_unlocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unlocked_by text,
  ADD COLUMN IF NOT EXISTS unlocked_at timestamptz;

CREATE OR REPLACE FUNCTION public.unlock_conversation_contact(
  p_conversation_id uuid,
  p_user_id text,
  p_payment_ref text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_convo public.conversations%ROWTYPE;
  v_other_id text;
  v_other_name text;
  v_user_name text;
BEGIN
  SELECT * INTO v_convo
  FROM public.conversations
  WHERE id = p_conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_convo.owner_id <> p_user_id AND v_convo.member_id <> p_user_id THEN
    RAISE EXCEPTION 'Not a member of this conversation' USING ERRCODE = '42501';
  END IF;

  v_other_id := CASE WHEN v_convo.owner_id = p_user_id THEN v_convo.member_id ELSE v_convo.owner_id END;

  UPDATE public.conversations
  SET contact_unlocked = true,
      unlocked_by = p_user_id,
      unlocked_at = now()
  WHERE id = p_conversation_id;

  SELECT name INTO v_user_name FROM public.user_profiles WHERE id = p_user_id;
  SELECT name INTO v_other_name FROM public.user_profiles WHERE id = v_other_id;

  -- System message in conversation
  INSERT INTO public.messages (conversation_id, sender_id, body)
  VALUES (
    p_conversation_id,
    p_user_id,
    'Contact details unlocked. You can now call or message directly to coordinate pickup and timing.'
  );

  -- Notify the other participant
  INSERT INTO public.notifications (
    recipient_id, actor_id, type, title, body, ride_id, metadata
  ) VALUES (
    v_other_id,
    p_user_id,
    'system',
    'Contact details shared',
    coalesce(v_user_name, 'Your co-traveler') || ' unlocked contact details for your ride.',
    v_convo.ride_id,
    jsonb_build_object('conversation_id', p_conversation_id, 'payment_ref', p_payment_ref)
  );

  RETURN jsonb_build_object('ok', true, 'contact_unlocked', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlock_conversation_contact TO anon, authenticated;

-- Update list_conversations to return other_phone when contact_unlocked is true
CREATE OR REPLACE FUNCTION public.list_conversations(p_user_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL OR btrim(p_user_id) = '' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.last_message_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      c.id,
      c.ride_id,
      c.last_message_at,
      c.contact_unlocked,
      (CASE WHEN c.owner_id = p_user_id THEN c.member_id ELSE c.owner_id END) AS other_user_id,
      (
        SELECT m.body FROM public.messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC LIMIT 1
      ) AS last_message,
      (
        SELECT count(*)::int FROM public.messages m
        WHERE m.conversation_id = c.id
          AND m.sender_id <> p_user_id
          AND m.read_at IS NULL
      ) AS unread_count,
      (SELECT up.name FROM public.user_profiles up
        WHERE up.id = (CASE WHEN c.owner_id = p_user_id THEN c.member_id ELSE c.owner_id END)
      ) AS other_name,
      (SELECT up.avatar_url FROM public.user_profiles up
        WHERE up.id = (CASE WHEN c.owner_id = p_user_id THEN c.member_id ELSE c.owner_id END)
      ) AS other_avatar,
      -- Only reveal phone if contact is unlocked!
      (CASE WHEN c.contact_unlocked = true THEN
        (SELECT up.phone_number FROM public.user_profiles up
          WHERE up.id = (CASE WHEN c.owner_id = p_user_id THEN c.member_id ELSE c.owner_id END))
        ELSE NULL
       END
      ) AS other_phone,
      (SELECT r.pickup_address FROM public.rides r WHERE r.id = c.ride_id) AS pickup_address,
      (SELECT r.dropoff_address FROM public.rides r WHERE r.id = c.ride_id) AS dropoff_address,
      (SELECT r.status FROM public.rides r WHERE r.id = c.ride_id) AS ride_status
    FROM public.conversations c
    WHERE c.owner_id = p_user_id OR c.member_id = p_user_id
  ) t;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_conversations TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Trip Execution RPCs (start_ride, complete_ride_trip)
-- -----------------------------------------------------------------------------
-- Allow status values 'in_progress'
ALTER TABLE public.rides DROP CONSTRAINT IF EXISTS rides_status_check;
ALTER TABLE public.rides ADD CONSTRAINT rides_status_check
  CHECK (status IN ('draft', 'active', 'confirmed', 'in_progress', 'completed', 'cancelled'));

-- Start Journey
CREATE OR REPLACE FUNCTION public.start_ride(
  p_ride_id uuid,
  p_driver_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ride public.rides%ROWTYPE;
  v_req record;
  v_driver_name text;
BEGIN
  SELECT * INTO v_ride FROM public.rides WHERE id = p_ride_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ride not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_ride.user_id <> p_driver_id THEN
    RAISE EXCEPTION 'Only the driver can start this journey' USING ERRCODE = '42501';
  END IF;

  IF v_ride.status NOT IN ('active', 'confirmed') THEN
    RAISE EXCEPTION 'Ride cannot be started from current status: %', v_ride.status USING ERRCODE = '22023';
  END IF;

  UPDATE public.rides
  SET status = 'in_progress',
      updated_at = now()
  WHERE id = p_ride_id;

  SELECT name INTO v_driver_name FROM public.user_profiles WHERE id = p_driver_id;

  -- Notify all accepted passengers
  FOR v_req IN
    SELECT requester_id, id FROM public.ride_requests
    WHERE ride_id = p_ride_id AND status = 'accepted'
  LOOP
    INSERT INTO public.notifications (
      recipient_id, actor_id, type, title, body, ride_id, request_id, metadata
    ) VALUES (
      v_req.requester_id,
      p_driver_id,
      'system',
      'Journey started!',
      coalesce(v_driver_name, 'Your driver') || ' has started the journey. Safe travels!',
      p_ride_id,
      v_req.id,
      jsonb_build_object('status', 'in_progress')
    );
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'status', 'in_progress');
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_ride TO anon, authenticated;

-- Complete Ride Trip
CREATE OR REPLACE FUNCTION public.complete_ride_trip(
  p_ride_id uuid,
  p_driver_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ride public.rides%ROWTYPE;
  v_co2 numeric;
  v_distance_km numeric;
  v_req record;
  v_driver_name text;
BEGIN
  SELECT * INTO v_ride FROM public.rides WHERE id = p_ride_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ride not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_ride.user_id <> p_driver_id THEN
    RAISE EXCEPTION 'Only the driver can complete this journey' USING ERRCODE = '42501';
  END IF;

  IF v_ride.status NOT IN ('active', 'confirmed', 'in_progress') THEN
    RAISE EXCEPTION 'Ride cannot be completed from current status: %', v_ride.status USING ERRCODE = '22023';
  END IF;

  v_distance_km := coalesce(v_ride.total_distance_meters, 0) / 1000.0;
  IF v_distance_km <= 0 THEN
    v_distance_km := 12.0; -- default estimate if geometry was straight fallback
  END IF;

  v_co2 := round((v_distance_km * 0.115)::numeric, 3); -- 0.115 kg CO2 per km

  UPDATE public.rides
  SET status = 'completed',
      co2_saved_kg = coalesce(co2_saved_kg, 0) + v_co2,
      updated_at = now()
  WHERE id = p_ride_id;

  -- Add CO2 to driver
  UPDATE public.user_profiles
  SET co2_saved_kg = coalesce(co2_saved_kg, 0) + v_co2,
      total_trips = coalesce(total_trips, 0) + 1
  WHERE id = p_driver_id;

  -- Driver completion reward in wallet
  INSERT INTO public.wallet_txns (
    user_id, amount, balance_after, kind, note, reference_id, created_at
  ) VALUES (
    p_driver_id,
    5,
    coalesce((SELECT balance FROM public.wallets WHERE user_id = p_driver_id), 0) + 5,
    'ride_credit',
    'Trip completion reward for ride ' || p_ride_id::text,
    p_ride_id::text,
    now()
  );

  UPDATE public.wallets
  SET balance = balance + 5,
      lifetime_earned = lifetime_earned + 5,
      updated_at = now()
  WHERE user_id = p_driver_id;

  SELECT name INTO v_driver_name FROM public.user_profiles WHERE id = p_driver_id;

  -- Process all accepted passengers
  FOR v_req IN
    SELECT requester_id, id FROM public.ride_requests
    WHERE ride_id = p_ride_id AND status = 'accepted'
  LOOP
    -- Add CO2 to passenger
    UPDATE public.user_profiles
    SET co2_saved_kg = coalesce(co2_saved_kg, 0) + v_co2,
        total_trips = coalesce(total_trips, 0) + 1
    WHERE id = v_req.requester_id;

    -- Passenger completion reward in wallet
    INSERT INTO public.wallet_txns (
      user_id, amount, balance_after, kind, note, reference_id, created_at
    ) VALUES (
      v_req.requester_id,
      5,
      coalesce((SELECT balance FROM public.wallets WHERE user_id = v_req.requester_id), 0) + 5,
      'ride_credit',
      'Trip completion reward for ride ' || p_ride_id::text,
      p_ride_id::text,
      now()
    );

    UPDATE public.wallets
    SET balance = balance + 5,
        lifetime_earned = lifetime_earned + 5,
        updated_at = now()
    WHERE user_id = v_req.requester_id;

    -- Notify passenger to rate
    INSERT INTO public.notifications (
      recipient_id, actor_id, type, title, body, ride_id, request_id, metadata
    ) VALUES (
      v_req.requester_id,
      p_driver_id,
      'system',
      'Ride Completed! Rate your trip',
      'You reached your destination with ' || coalesce(v_driver_name, 'the driver') || '. Please share your feedback!',
      p_ride_id,
      v_req.id,
      jsonb_build_object('status', 'completed', 'co2_saved_kg', v_co2)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'completed',
    'co2_saved_kg', v_co2,
    'reward_amount', 5
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_ride_trip TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Atomic Cancellation of a Ride Request
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_ride_request_atomic(
  p_request_id uuid,
  p_requester_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_req public.ride_requests%ROWTYPE;
  v_ride public.rides%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.ride_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_req.requester_id <> p_requester_id THEN
    RAISE EXCEPTION 'Not authorized to cancel this request' USING ERRCODE = '42501';
  END IF;

  IF v_req.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', true, 'status', 'cancelled');
  END IF;

  SELECT * INTO v_ride FROM public.rides WHERE id = v_req.ride_id;

  UPDATE public.ride_requests
  SET status = 'cancelled',
      responded_at = now()
  WHERE id = p_request_id;

  -- If it was accepted, release seat
  IF v_req.status = 'accepted' THEN
    UPDATE public.rides
    SET occupied_seats = GREATEST(0, occupied_seats - 1),
        available_seats = available_seats + 1
    WHERE id = v_req.ride_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'cancelled');
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_ride_request_atomic TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. Spend Wallet Balance RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.spend_wallet_balance(
  p_user_id text,
  p_amount numeric,
  p_note text DEFAULT NULL,
  p_reference_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet public.wallets;
  v_amount numeric := round(p_amount, 2);
BEGIN
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.wallets (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_wallet.balance < v_amount THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_balance', 'balance', v_wallet.balance);
  END IF;

  UPDATE public.wallets
  SET balance = balance - v_amount,
      lifetime_spent = lifetime_spent + v_amount
  WHERE user_id = p_user_id
  RETURNING * INTO v_wallet;

  INSERT INTO public.wallet_txns (user_id, amount, balance_after, kind, note, reference_id)
  VALUES (p_user_id, -v_amount, v_wallet.balance, 'spend', p_note, p_reference_id);

  RETURN jsonb_build_object(
    'ok', true,
    'balance_after', v_wallet.balance,
    'spent', v_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.spend_wallet_balance TO anon, authenticated;

COMMIT;

