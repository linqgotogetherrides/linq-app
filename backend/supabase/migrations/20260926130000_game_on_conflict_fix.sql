-- =============================================================================
-- validate_game_result() still used an ON CONFLICT target that no longer
-- matched its index once game_rewards uniqueness was split into two partial
-- indexes. Switching to a bare ON CONFLICT DO NOTHING keeps the same
-- guarantee (the unique indexes still reject the duplicate) without having to
-- repeat the partial-index predicates inside every function.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_game_result(
  p_session_id uuid,
  p_user_id text,
  p_claim_result text,
  p_claim_score integer,
  p_claim_passengers integer,
  p_claim_duration_ms integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.game_sessions;
  v_profile public.game_profiles;
  v_elapsed_ms integer;
  v_result text;
  v_passengers integer;
  v_score integer;
  v_wallet_balance numeric;
  v_milestone boolean := false;
  v_rewarded boolean := false;
BEGIN
  ---------------------------------------------------------------
  -- 1. Load and lock the session.
  ---------------------------------------------------------------
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session_not_found');
  END IF;

  IF v_session.user_id <> p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session_not_yours');
  END IF;

  -- Already settled: report the original outcome, pay nothing further.
  IF v_session.ended_at IS NOT NULL THEN
    SELECT * INTO v_profile FROM public.game_profiles WHERE user_id = p_user_id;
    RETURN jsonb_build_object(
      'ok', true, 'already_settled', true, 'result', v_session.result,
      'validated', v_session.validated, 'note', v_session.validation_note,
      'profile', v_profile
    );
  END IF;

  ---------------------------------------------------------------
  -- 2. Time plausibility, measured on the SERVER clock.
  ---------------------------------------------------------------
  v_elapsed_ms := floor(EXTRACT(EPOCH FROM (now() - v_session.started_at)) * 1000)::integer;

  IF v_elapsed_ms > 45_000 OR v_elapsed_ms < 0 THEN
    UPDATE public.game_sessions
    SET ended_at = now(), result = 'LOSS', validated = false,
        duration_ms = v_elapsed_ms,
        validation_note = 'implausible duration: ' || v_elapsed_ms || 'ms'
    WHERE id = p_session_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'implausible_duration', 'elapsed_ms', v_elapsed_ms);
  END IF;

  ---------------------------------------------------------------
  -- 3. Passenger plausibility. A seat every ~2.2s is a generous floor, so
  --    this only rejects physically impossible claims.
  ---------------------------------------------------------------
  v_passengers := GREATEST(0, LEAST(coalesce(p_claim_passengers, 0), v_session.seats_required));
  IF v_passengers > (v_elapsed_ms / 2200) + 1 THEN
    UPDATE public.game_sessions
    SET ended_at = now(), result = 'LOSS', validated = false,
        passengers_collected = 0, duration_ms = v_elapsed_ms,
        validation_note = 'passenger count exceeds what the elapsed time allows'
    WHERE id = p_session_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'implausible_passenger_count');
  END IF;

  ---------------------------------------------------------------
  -- 4. Decide the outcome from server-side facts.
  ---------------------------------------------------------------
  IF upper(coalesce(p_claim_result, '')) = 'WIN'
     AND v_passengers >= v_session.seats_required
     AND v_elapsed_ms < 30_000 THEN
    v_result := 'WIN';
  ELSE
    v_result := 'LOSS';
  END IF;

  v_score := GREATEST(0, coalesce(p_claim_score, 0)) + (v_passengers * 50) + v_elapsed_ms / 100;

  UPDATE public.game_sessions
  SET ended_at = now(),
      result = v_result,
      score = v_score,
      passengers_collected = v_passengers,
      duration_ms = v_elapsed_ms,
      validated = true,
      validation_note = 'ok'
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  ---------------------------------------------------------------
  -- 5. Settle rewards (server-computed, idempotent).
  ---------------------------------------------------------------
  IF v_result = 'WIN' THEN
    INSERT INTO public.game_rewards (user_id, game_session_id, referral_id, reward_type, amount, source)
    VALUES (p_user_id, p_session_id, NULL, 'GAME_WIN', 5, 'FILL_THE_RIDE')
    ON CONFLICT DO NOTHING;

    IF FOUND THEN
      v_rewarded := true;
      PERFORM public.add_wallet_credit(
        p_user_id, 5, 'ride_credit',
        'Fill the Ride - win', p_session_id::text
      );
    END IF;

    UPDATE public.game_profiles
    SET total_wins = total_wins + 1,
        best_score = GREATEST(best_score, v_score)
    WHERE user_id = p_user_id
    RETURNING * INTO v_profile;

    IF v_profile.total_wins >= 10 AND v_profile.milestone_claimed_at IS NULL THEN
      v_milestone := true;
    END IF;
  ELSE
    SELECT * INTO v_profile FROM public.game_profiles WHERE user_id = p_user_id;
  END IF;

  SELECT balance INTO v_wallet_balance FROM public.wallets WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'already_settled', false,
    'result', v_result,
    'score', v_score,
    'passengers', v_passengers,
    'duration_ms', v_elapsed_ms,
    'reward_paid', v_rewarded,
    'milestone_reached', v_milestone,
    'profile', v_profile,
    'wallet_balance', v_wallet_balance
  );
END;
$$;

COMMIT;
