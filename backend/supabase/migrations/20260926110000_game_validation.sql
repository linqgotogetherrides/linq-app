-- =============================================================================
-- Game result validation + reward settlement.
--
-- This is the anti-cheat boundary. The client sends its *claim*; this function
-- decides the *truth* from server-side facts only:
--
--   * the session must exist, belong to the caller, and still be open
--   * the elapsed wall-clock time must be physically possible for the run
--   * the claimed passenger count must be achievable in that time
--   * a WIN requires every seat collected AND the time not to have expired
--   * rewards are unique per session, so a replayed result pays nothing
--
-- Nothing the client sends can raise lives, wins, or balance on its own.
-- =============================================================================

BEGIN;

-- A run cannot legitimately take longer than the level clock plus slack.
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
  v_reward jsonb;
  v_wallet_balance numeric;
  v_milestone boolean := false;
  v_claimed_total_wins integer;
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

  -- The level clock is 30s. Allow generous slack for app suspends and network
  -- latency, but anything past this is a client holding a session open.
  IF v_elapsed_ms > 45_000 OR v_elapsed_ms < 0 THEN
    UPDATE public.game_sessions
    SET ended_at = now(), result = 'LOSS', validated = false,
        duration_ms = v_elapsed_ms,
        validation_note = 'implausible duration: ' || v_elapsed_ms || 'ms'
    WHERE id = p_session_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'implausible_duration', 'elapsed_ms', v_elapsed_ms);
  END IF;

  ---------------------------------------------------------------
  -- 3. Passenger plausibility.
  --    A player cannot collect more passengers than the road could have
  --    presented in the time available. One seat per ~2.2s is a generous
  --    floor, so this only rejects impossible claims.
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
  --    A WIN requires a full car and a finish before the clock ran out.
  ---------------------------------------------------------------
  v_claimed_total_wins := 0;

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
    INSERT INTO public.game_rewards (user_id, game_session_id, reward_type, amount, source)
    VALUES (p_user_id, p_session_id, 'GAME_WIN', 5, 'FILL_THE_RIDE')
    ON CONFLICT (game_session_id, reward_type) DO NOTHING;

    IF FOUND THEN
      -- Move real money through the same locked wallet path used by referrals
      -- and top-ups, so the ledger stays consistent.
      PERFORM public.add_wallet_credit(
        p_user_id, 5, 'ride_credit',
        'Fill the Ride — win', p_session_id::text
      );
    END IF;

    UPDATE public.game_profiles
    SET total_wins = total_wins + 1,
        best_score = GREATEST(best_score, v_score)
    WHERE user_id = p_user_id
    RETURNING * INTO v_profile;

    -- 10-win milestone: reported, but claimed explicitly by the user.
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
    'reward_paid', (v_result = 'WIN'),
    'milestone_reached', v_milestone,
    'profile', v_profile,
    'wallet_balance', v_wallet_balance
  );
END;
$$;

-- Explicitly claim the 10-win milestone reward. Never automatic.
CREATE OR REPLACE FUNCTION public.claim_game_milestone(p_user_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.game_profiles;
  v_session_id uuid;
BEGIN
  SELECT * INTO v_profile FROM public.game_profiles WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_profile');
  END IF;

  IF v_profile.total_wins < 10 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_enough_wins', 'total_wins', v_profile.total_wins);
  END IF;

  IF v_profile.milestone_claimed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed', 'profile', v_profile);
  END IF;

  SELECT id INTO v_session_id
  FROM public.game_sessions
  WHERE user_id = p_user_id AND result = 'WIN'
  ORDER BY ended_at DESC LIMIT 1;

  INSERT INTO public.game_rewards (user_id, game_session_id, reward_type, amount, source)
  VALUES (p_user_id, v_session_id, 'MILESTONE_BONUS', 0, 'MILESTONE')
  ON CONFLICT (game_session_id, reward_type) DO NOTHING;

  UPDATE public.game_profiles
  SET milestone_claimed_at = now()
  WHERE user_id = p_user_id
  RETURNING * INTO v_profile;

  RETURN jsonb_build_object('ok', true, 'profile', v_profile);
END;
$$;

-- Read-only profile fetch with weekly refill applied. Clients cannot write.
CREATE OR REPLACE FUNCTION public.get_game_profile(p_user_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.game_profiles;
BEGIN
  v_profile := public.refill_game_lives(p_user_id);
  RETURN jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'weekly_lives', v_profile.weekly_lives,
    'bonus_lives', v_profile.bonus_lives,
    'total_lives', v_profile.weekly_lives + v_profile.bonus_lives,
    'total_games', v_profile.total_games,
    'total_wins', v_profile.total_wins,
    'referral_lives_earned', v_profile.referral_lives_earned,
    'tutorial_seen', v_profile.tutorial_seen,
    'best_score', v_profile.best_score,
    'milestone_unlocked', v_profile.total_wins >= 10,
    'milestone_claimed', v_profile.milestone_claimed_at IS NOT NULL,
    'last_weekly_refill', v_profile.last_weekly_refill,
    'next_refill_at', v_profile.last_weekly_refill + interval '7 days'
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Grants: no client writes at all.
-- -----------------------------------------------------------------------------
ALTER TABLE public.game_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS game_profiles_client_read ON public.game_profiles;
CREATE POLICY game_profiles_client_read ON public.game_profiles
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS game_sessions_client_read ON public.game_sessions;
CREATE POLICY game_sessions_client_read ON public.game_sessions
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS game_rewards_client_read ON public.game_rewards;
CREATE POLICY game_rewards_client_read ON public.game_rewards
  FOR SELECT TO anon, authenticated USING (true);

REVOKE ALL ON public.game_profiles FROM anon, authenticated;
REVOKE ALL ON public.game_sessions FROM anon, authenticated;
REVOKE ALL ON public.game_rewards FROM anon, authenticated;

GRANT SELECT ON public.game_profiles TO anon, authenticated;
GRANT SELECT ON public.game_sessions TO anon, authenticated;
GRANT SELECT ON public.game_rewards TO anon, authenticated;

GRANT ALL ON public.game_profiles TO service_role;
GRANT ALL ON public.game_sessions TO service_role;
GRANT ALL ON public.game_rewards TO service_role;

REVOKE ALL ON FUNCTION public.refill_game_lives(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_game_session(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_game_result(uuid, text, text, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_game_milestone(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_game_profile(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_game_tutorial_seen(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_referral_life(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_life_for_referral(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_game_profile(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_game_session(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_game_result(uuid, text, text, integer, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_game_milestone(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_game_tutorial_seen(text) TO anon, authenticated;
-- Referral lives are only granted through the verified referral flow.
GRANT EXECUTE ON FUNCTION public.grant_life_for_referral(uuid) TO anon, authenticated;

COMMIT;
