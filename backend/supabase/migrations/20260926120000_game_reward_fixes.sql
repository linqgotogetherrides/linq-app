-- =============================================================================
-- Fixes for the Fill the Ride backend.
--
-- 1. game_rewards.game_session_id was NOT NULL, but a referral life may be
--    granted to someone who has never played a game. grant_referral_life()
--    therefore hit an FK violation. The column is now nullable and referral
--    rewards are keyed by referral_id instead.
--
--    The anti-replay guarantee is preserved by splitting the uniqueness rules:
--      * game rewards  -> unique per (game_session_id, reward_type)
--      * referral lives -> unique per referral (one life per referral, forever)
--
-- 2. start_game_session() returned a profile snapshot taken before
--    total_games was incremented, so the client saw a stale count.
-- =============================================================================

BEGIN;

ALTER TABLE public.game_rewards
  ADD COLUMN IF NOT EXISTS referral_id uuid REFERENCES public.referrals(id) ON DELETE CASCADE;

ALTER TABLE public.game_rewards
  ALTER COLUMN game_session_id DROP NOT NULL;

-- Exactly one of the two must be present.
ALTER TABLE public.game_rewards
  DROP CONSTRAINT IF EXISTS game_rewards_reference_check;

ALTER TABLE public.game_rewards
  ADD CONSTRAINT game_rewards_reference_check
  CHECK (
    (game_session_id IS NOT NULL AND reward_type <> 'REFERRAL_LIFE')
    OR (referral_id IS NOT NULL AND reward_type = 'REFERRAL_LIFE')
  );

-- Replace the single unique index with two partial ones.
DROP INDEX IF EXISTS public.game_rewards_session_unique;

CREATE UNIQUE INDEX IF NOT EXISTS game_rewards_session_unique
  ON public.game_rewards (game_session_id, reward_type)
  WHERE game_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS game_rewards_referral_unique
  ON public.game_rewards (referral_id)
  WHERE referral_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Rewrite the session + reward functions with correct reference handling
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_game_session(p_user_id text, p_seats_required integer DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.game_profiles;
  v_session public.game_sessions;
BEGIN
  v_profile := public.refill_game_lives(p_user_id);

  IF (v_profile.weekly_lives + v_profile.bonus_lives) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'out_of_lives', 'profile', v_profile);
  END IF;

  -- Close any stale open session so a crash cannot strand the player.
  UPDATE public.game_sessions
  SET ended_at = now(), result = 'ABANDONED', validated = false,
      validation_note = 'superseded by a new session'
  WHERE user_id = p_user_id AND ended_at IS NULL;

  IF v_profile.weekly_lives > 0 THEN
    UPDATE public.game_profiles SET weekly_lives = weekly_lives - 1
    WHERE user_id = p_user_id;
  ELSE
    UPDATE public.game_profiles SET bonus_lives = bonus_lives - 1
    WHERE user_id = p_user_id;
  END IF;

  INSERT INTO public.game_sessions (user_id, seats_required, lives_consumed)
  VALUES (p_user_id, GREATEST(1, LEAST(p_seats_required, 5)), 1)
  RETURNING * INTO v_session;

  -- Re-read AFTER mutating so the returned snapshot includes total_games.
  UPDATE public.game_profiles SET total_games = total_games + 1
  WHERE user_id = p_user_id
  RETURNING * INTO v_profile;

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', v_session.id,
    'started_at', v_session.started_at,
    'profile', v_profile
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_referral_life(
  p_user_id text,
  p_referral_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.game_profiles;
BEGIN
  INSERT INTO public.game_rewards (user_id, game_session_id, referral_id, reward_type, amount, source)
  VALUES (p_user_id, NULL, p_referral_id, 'REFERRAL_LIFE', 0, 'REFERRAL')
  ON CONFLICT DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_granted');
  END IF;

  v_profile := public.refill_game_lives(p_user_id);

  UPDATE public.game_profiles
  SET bonus_lives = bonus_lives + 1,
      referral_lives_earned = referral_lives_earned + 1
  WHERE user_id = p_user_id
  RETURNING * INTO v_profile;

  RETURN jsonb_build_object('ok', true, 'profile', v_profile, 'referral_id', p_referral_id);
END;
$$;

-- The milestone bonus was keyed off a game session; keep it that way.
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

  IF v_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_win_session');
  END IF;

  INSERT INTO public.game_rewards (user_id, game_session_id, referral_id, reward_type, amount, source)
  VALUES (p_user_id, v_session_id, NULL, 'MILESTONE_BONUS', 0, 'MILESTONE')
  ON CONFLICT DO NOTHING;

  UPDATE public.game_profiles SET milestone_claimed_at = now()
  WHERE user_id = p_user_id
  RETURNING * INTO v_profile;

  RETURN jsonb_build_object('ok', true, 'profile', v_profile);
END;
$$;

COMMIT;
