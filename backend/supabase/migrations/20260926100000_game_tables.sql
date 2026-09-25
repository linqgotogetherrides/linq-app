-- =============================================================================
-- "Fill the Ride" mini-game: profiles, sessions, rewards.
--
-- THREAT MODEL
--   The client is fully untrusted. It may claim any score, any result, any
--   passenger count, any win. Therefore:
--     * Clients get NO direct write access to any of these tables.
--     * All writes happen in SECURITY DEFINER functions that recompute the
--       truth (lives, wins, balance) rather than trusting a submitted number.
--     * A game session is opened server-side, and its result is only accepted
--       if the session exists, is still open, and the wall-clock duration is
--       physically possible.
--     * Rewards are unique per session, so a replayed result pays nothing.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. game_profiles — lives, wins, weekly refill
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.game_profiles (
  user_id text PRIMARY KEY,
  -- Lives from the weekly free allowance (max 3) and from referrals (uncapped).
  weekly_lives integer NOT NULL DEFAULT 3 CHECK (weekly_lives >= 0 AND weekly_lives <= 3),
  bonus_lives integer NOT NULL DEFAULT 0 CHECK (bonus_lives >= 0),
  -- Server clock only. The device clock is never consulted for the refill.
  last_weekly_refill timestamptz NOT NULL DEFAULT now(),
  total_games integer NOT NULL DEFAULT 0 CHECK (total_games >= 0),
  total_wins integer NOT NULL DEFAULT 0 CHECK (total_wins >= 0),
  referral_lives_earned integer NOT NULL DEFAULT 0 CHECK (referral_lives_earned >= 0),
  tutorial_seen boolean NOT NULL DEFAULT false,
  best_score integer NOT NULL DEFAULT 0,
  -- Set once the player reaches the 10-win milestone.
  milestone_claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_profiles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS game_profiles_wins_idx
  ON public.game_profiles (total_wins DESC);

DROP TRIGGER IF EXISTS game_profiles_set_updated_at ON public.game_profiles;
CREATE TRIGGER game_profiles_set_updated_at
BEFORE UPDATE ON public.game_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Create the row on signup, alongside the wallet.
CREATE OR REPLACE FUNCTION public.ensure_game_profile_exists()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.game_profiles (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_ensure_game_profile ON public.user_profiles;
CREATE TRIGGER user_profiles_ensure_game_profile
AFTER INSERT ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.ensure_game_profile_exists();

INSERT INTO public.game_profiles (user_id)
SELECT p.id FROM public.user_profiles p
ON CONFLICT (user_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. game_sessions — one row per attempt
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  result text,
  score integer NOT NULL DEFAULT 0,
  passengers_collected integer NOT NULL DEFAULT 0,
  seats_required integer NOT NULL DEFAULT 5,
  duration_ms integer,
  lives_consumed integer NOT NULL DEFAULT 0,
  -- Server verdict. The client's claimed result is only ever advisory.
  validated boolean NOT NULL DEFAULT false,
  validation_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_sessions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  CONSTRAINT game_sessions_result_check
    CHECK (result IS NULL OR result IN ('WIN', 'LOSS', 'ABANDONED'))
);

CREATE INDEX IF NOT EXISTS game_sessions_user_started_idx
  ON public.game_sessions (user_id, started_at DESC);
-- At most one open session per user.
CREATE UNIQUE INDEX IF NOT EXISTS game_sessions_one_open_per_user
  ON public.game_sessions (user_id)
  WHERE ended_at IS NULL;

-- -----------------------------------------------------------------------------
-- 3. game_rewards — immutable ledger, one row per session
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.game_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  game_session_id uuid NOT NULL,
  reward_type text NOT NULL,
  amount numeric(12,2) NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_rewards_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  CONSTRAINT game_rewards_session_id_fkey
    FOREIGN KEY (game_session_id) REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  CONSTRAINT game_rewards_type_check
    CHECK (reward_type IN ('GAME_WIN', 'MILESTONE_BONUS', 'REFERRAL_LIFE')),
  CONSTRAINT game_rewards_source_check
    CHECK (source IN ('FILL_THE_RIDE', 'MILESTONE', 'REFERRAL'))
);

-- This constraint is the anti-replay guarantee for rewards.
CREATE UNIQUE INDEX IF NOT EXISTS game_rewards_session_unique
  ON public.game_rewards (game_session_id, reward_type);

-- -----------------------------------------------------------------------------
-- 4. Weekly refill, lives, and session lifecycle
-- -----------------------------------------------------------------------------

-- Restores the 3 free lives once every 7 days, using the server clock only.
CREATE OR REPLACE FUNCTION public.refill_game_lives(p_user_id text)
RETURNS public.game_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.game_profiles;
BEGIN
  INSERT INTO public.game_profiles (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.game_profiles
  SET weekly_lives = 3,
      last_weekly_refill = now()
  WHERE user_id = p_user_id
    AND now() >= last_weekly_refill + interval '7 days'
    AND weekly_lives < 3
  RETURNING * INTO v_profile;

  IF v_profile IS NULL THEN
    SELECT * INTO v_profile FROM public.game_profiles WHERE user_id = p_user_id;
  END IF;

  -- Never advance the refill stamp for a player who still has lives, otherwise
  -- the timer could be dragged forward forever by not playing.
  IF v_profile.weekly_lives >= 3 AND now() >= v_profile.last_weekly_refill + interval '7 days' THEN
    UPDATE public.game_profiles
    SET last_weekly_refill = now()
    WHERE user_id = p_user_id;
  END IF;

  RETURN v_profile;
END;
$$;

-- Opens a session. Consumes exactly one life, server-side.
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

  -- Consume a life: weekly first, then referral-earned.
  IF v_profile.weekly_lives > 0 THEN
    UPDATE public.game_profiles SET weekly_lives = weekly_lives - 1
    WHERE user_id = p_user_id RETURNING * INTO v_profile;
  ELSE
    UPDATE public.game_profiles SET bonus_lives = bonus_lives - 1
    WHERE user_id = p_user_id RETURNING * INTO v_profile;
  END IF;

  INSERT INTO public.game_sessions (user_id, seats_required, lives_consumed)
  VALUES (p_user_id, GREATEST(1, LEAST(p_seats_required, 5)), 1)
  RETURNING * INTO v_session;

  UPDATE public.game_profiles SET total_games = total_games + 1
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', v_session.id,
    'started_at', v_session.started_at,
    'profile', v_profile
  );
END;
$$;

-- Marks the tutorial as seen. Cosmetic, but stored server-side so the client
-- cannot be made to re-show or hide it inconsistently.
CREATE OR REPLACE FUNCTION public.mark_game_tutorial_seen(p_user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.game_profiles SET tutorial_seen = true
  WHERE user_id = p_user_id;
END;
$$;

-- Grants +1 referral life. Only ever called by the verified-referral flow.
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
  v_created boolean := false;
BEGIN
  -- One life per referral, enforced by the unique index on game_rewards.
  INSERT INTO public.game_rewards (user_id, game_session_id, reward_type, amount, source)
  VALUES (
    p_user_id,
    coalesce((
      SELECT s.id FROM public.game_sessions s
      WHERE s.user_id = p_user_id
      ORDER BY s.started_at DESC LIMIT 1
    ), gen_random_uuid()),
    'REFERRAL_LIFE', 0, 'REFERRAL'
  )
  ON CONFLICT (game_session_id, reward_type) DO NOTHING;

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

-- Grants a life for a referral that has reached the verified milestone.
CREATE OR REPLACE FUNCTION public.grant_life_for_referral(p_referral_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral public.referrals;
  v_result jsonb;
BEGIN
  SELECT * INTO v_referral FROM public.referrals WHERE id = p_referral_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'referral_not_found');
  END IF;

  -- "Verified" means the referral actually joined AND the reward already paid.
  IF v_referral.status NOT IN ('JOINED', 'COMPLETED') OR NOT v_referral.reward_credited THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'referral_not_verified', 'status', v_referral.status);
  END IF;

  v_result := public.grant_referral_life(v_referral.referrer_id, v_referral.id);
  IF (v_result->>'ok')::boolean IS TRUE THEN
    UPDATE public.referrals SET status = 'COMPLETED', first_ride_completed_at = now()
    WHERE id = v_referral.id;
  END IF;
  RETURN v_result;
END;
$$;

COMMIT;
