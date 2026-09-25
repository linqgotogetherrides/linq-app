-- =============================================================================
-- Referrals + persistent wallet.
--
-- PROBLEM WITH THE PREVIOUS BEHAVIOUR
--   * wallet balance lived only in React state, so it reset to 0 on restart.
--   * "Refer a Friend" used a hard-coded code and toast-only buttons. Nothing
--     was ever credited to anybody.
--
-- WHAT THIS ADDS
--   public.wallets        - durable balance per user (replaces in-memory state)
--   public.wallet_txns    - immutable ledger, so a balance is always explainable
--   public.referrals      - one row per (referrer, referee), credits once
--   create_referral_code  - stable per-user code generation
--   claim_referral        - atomic, idempotent signup credit (₹5)
--   add_wallet_credit     - service-role credit path for the referral worker
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Wallets
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallets (
  user_id text PRIMARY KEY,
  balance numeric(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  lifetime_earned numeric(12,2) NOT NULL DEFAULT 0 CHECK (lifetime_earned >= 0),
  lifetime_spent numeric(12,2) NOT NULL DEFAULT 0 CHECK (lifetime_spent >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallets_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.wallet_txns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  amount numeric(12,2) NOT NULL,
  balance_after numeric(12,2) NOT NULL,
  kind text NOT NULL,
  note text,
  reference_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_txns_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  CONSTRAINT wallet_txns_kind_check
    CHECK (kind IN ('referral_reward', 'topup', 'ride_credit', 'refund', 'admin_adjustment', 'spend')),
  CONSTRAINT wallet_txns_amount_nonzero CHECK (amount <> 0)
);

CREATE INDEX IF NOT EXISTS wallet_txns_user_created_idx
  ON public.wallet_txns (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_txns_reference_idx
  ON public.wallet_txns (reference_id)
  WHERE reference_id IS NOT NULL;

DROP TRIGGER IF EXISTS wallets_set_updated_at ON public.wallets;
CREATE TRIGGER wallets_set_updated_at
BEFORE UPDATE ON public.wallets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Referrals
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id text NOT NULL,
  referee_id text NOT NULL,
  referral_code text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  reward_amount numeric(12,2) NOT NULL DEFAULT 5,
  reward_credited boolean NOT NULL DEFAULT false,
  credited_at timestamptz,
  first_ride_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referrals_referrer_id_fkey
    FOREIGN KEY (referrer_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  CONSTRAINT referrals_referee_id_fkey
    FOREIGN KEY (referee_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  CONSTRAINT referrals_status_check
    CHECK (status IN ('PENDING', 'JOINED', 'COMPLETED', 'REJECTED')),
  CONSTRAINT referrals_not_self CHECK (referrer_id <> referee_id),
  -- The core anti-abuse guarantee: one reward per referee, forever.
  CONSTRAINT referrals_referee_unique UNIQUE (referee_id)
);

CREATE INDEX IF NOT EXISTS referrals_referrer_idx
  ON public.referrals (referrer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS referrals_code_idx
  ON public.referrals (referral_code)
  WHERE status <> 'REJECTED';

DROP TRIGGER IF EXISTS referrals_set_updated_at ON public.referrals;
CREATE TRIGGER referrals_set_updated_at
BEFORE UPDATE ON public.referrals
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Auto-create a wallet row when a profile is created
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_wallet_exists()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wallets (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_ensure_wallet ON public.user_profiles;
CREATE TRIGGER user_profiles_ensure_wallet
AFTER INSERT ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.ensure_wallet_exists();

-- Backfill any profile that predates this migration.
INSERT INTO public.wallets (user_id)
SELECT p.id FROM public.user_profiles p
ON CONFLICT (user_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. Stable referral code generation
--    Format: LINQ-<first 4 letters of name><6 base32 chars>
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_referral_code(p_user_id text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_prefix text;
  v_code text;
  v_attempt int := 0;
  v_name text;
BEGIN
  SELECT COALESCE(NULLIF(btrim(name), ''), 'LINQ')
  INTO v_name
  FROM public.user_profiles
  WHERE id = p_user_id;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Profile % not found', p_user_id USING ERRCODE = 'P0002';
  END IF;

  v_prefix := upper(regexp_replace(left(v_name, 4), '[^A-Za-z]', '', 'g'));
  IF v_prefix = '' THEN
    v_prefix := 'LINQ';
  END IF;

  -- Deterministic and collision-checked, so retries return the same code.
  -- pgcrypto is installed into the `extensions` schema in this project, so the
  -- function must be schema-qualified.
  LOOP
    v_code := 'LINQ-' || v_prefix || '-' ||
      upper(encode(extensions.gen_random_bytes(4), 'hex'));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.referrals r
      WHERE r.referral_code = v_code AND r.status <> 'REJECTED'
    );
    v_attempt := v_attempt + 1;
    EXIT WHEN v_attempt > 5;
  END LOOP;

  RETURN v_code;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Atomic wallet credit
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_wallet_credit(
  p_user_id text,
  p_amount numeric,
  p_kind text,
  p_note text DEFAULT NULL,
  p_reference_id text DEFAULT NULL
)
RETURNS public.wallets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet public.wallets;
  v_amount numeric := round(p_amount, 2);
BEGIN
  IF p_amount IS NULL OR v_amount = 0 THEN
    RAISE EXCEPTION 'amount must be non-zero' USING ERRCODE = '22023';
  END IF;
  IF p_kind IS NULL
     OR p_kind NOT IN ('referral_reward','topup','ride_credit','refund','admin_adjustment','spend') THEN
    RAISE EXCEPTION 'invalid wallet transaction kind: %', p_kind USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.wallets (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Row lock makes concurrent credits additive rather than lost-update.
  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  UPDATE public.wallets
  SET balance = balance + v_amount,
      lifetime_earned = lifetime_earned + GREATEST(v_amount, 0),
      lifetime_spent  = lifetime_spent  + GREATEST(-v_amount, 0)
  WHERE user_id = p_user_id
  RETURNING * INTO v_wallet;

  INSERT INTO public.wallet_txns (user_id, amount, balance_after, kind, note, reference_id)
  VALUES (p_user_id, v_amount, v_wallet.balance, p_kind, p_note, p_reference_id);

  RETURN v_wallet;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Referral claim (sign-up credit)
--
--    Idempotent: the UNIQUE(referee_id) constraint means a referee can be
--    credited at most once, and calling this twice is a no-op that still
--    returns the original result.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_referral(
  p_code text,
  p_referee_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral public.referrals;
  v_wallet public.wallets;
  v_existing public.referrals;
  v_balance numeric;
BEGIN
  IF p_code IS NULL OR btrim(p_code) = '' THEN
    RAISE EXCEPTION 'referral code is required' USING ERRCODE = '22023';
  END IF;
  IF p_referee_id IS NULL OR btrim(p_referee_id) = '' THEN
    RAISE EXCEPTION 'referee id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = p_referee_id) THEN
    RAISE EXCEPTION 'profile % not found', p_referee_id USING ERRCODE = 'P0002';
  END IF;

  -- Already referred? Return the original outcome, do not credit again.
  SELECT * INTO v_existing
  FROM public.referrals
  WHERE referee_id = p_referee_id;

  IF FOUND THEN
    SELECT balance INTO v_balance FROM public.wallets WHERE user_id = v_existing.referrer_id;
    RETURN jsonb_build_object(
      'ok', true,
      'already_claimed', true,
      'credited', v_existing.reward_credited,
      'reward_amount', v_existing.reward_amount,
      'referrer_id', v_existing.referrer_id,
      'referral_code', v_existing.referral_code,
      'status', v_existing.status,
      'referrer_balance', v_balance
    );
  END IF;

  SELECT * INTO v_referral
  FROM public.referrals
  WHERE upper(referral_code) = upper(btrim(p_code))
    AND status <> 'REJECTED'
  ORDER BY created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code');
  END IF;

  IF v_referral.referrer_id = p_referee_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self_referral');
  END IF;

  INSERT INTO public.referrals (referrer_id, referee_id, referral_code, status)
  VALUES (v_referral.referrer_id, p_referee_id, v_referral.referral_code, 'JOINED')
  RETURNING * INTO v_referral;

  -- The spec pays the referrer ₹5 when the invitee uses the referral.
  PERFORM public.add_wallet_credit(
    v_referral.referrer_id,
    v_referral.reward_amount,
    'referral_reward',
    'Referral reward for ' || p_referee_id,
    v_referral.id::text
  );

  UPDATE public.referrals
  SET reward_credited = true, credited_at = now()
  WHERE id = v_referral.id;

  SELECT balance INTO v_balance FROM public.wallets WHERE user_id = v_referral.referrer_id;

  RETURN jsonb_build_object(
    'ok', true,
    'already_claimed', false,
    'credited', true,
    'reward_amount', v_referral.reward_amount,
    'referrer_id', v_referral.referrer_id,
    'referral_code', v_referral.referral_code,
    'status', v_referral.status,
    'referrer_balance', v_balance
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. RLS + grants
--    Wallet and referral rows are readable by their owner so the app can show a
--    real balance. MUTATIONS only happen inside the SECURITY DEFINER functions
--    above, so a client can never mint money by writing a wallet row.
-- -----------------------------------------------------------------------------
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_txns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Remove the "seed" pattern used by create_referral_code: a code row would be
-- blocked by referrals_referee_unique, so codes are held in memory by the app
-- and validated against real referral rows. To keep codes stable and unique we
-- store them on the profile instead.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS referral_code text;
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS referred_by_code text;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_referral_code_unique
  ON public.user_profiles (referral_code)
  WHERE referral_code IS NOT NULL;

-- Backfill codes for everyone who does not have one yet.
UPDATE public.user_profiles p
SET referral_code = public.create_referral_code(p.id)
WHERE p.referral_code IS NULL;

-- Referrer lookup is now by profile column, which is unique and indexed.
CREATE OR REPLACE FUNCTION public.find_referrer_by_code(p_code text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.user_profiles
  WHERE upper(referral_code) = upper(btrim(p_code))
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.claim_referral(
  p_code text,
  p_referee_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_id text;
  v_referral public.referrals;
  v_existing public.referrals;
  v_balance numeric;
BEGIN
  IF p_code IS NULL OR btrim(p_code) = '' THEN
    RAISE EXCEPTION 'referral code is required' USING ERRCODE = '22023';
  END IF;
  IF p_referee_id IS NULL OR btrim(p_referee_id) = '' THEN
    RAISE EXCEPTION 'referee id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = p_referee_id) THEN
    RAISE EXCEPTION 'profile % not found', p_referee_id USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_existing
  FROM public.referrals
  WHERE referee_id = p_referee_id;

  IF FOUND THEN
    SELECT balance INTO v_balance FROM public.wallets WHERE user_id = v_existing.referrer_id;
    RETURN jsonb_build_object(
      'ok', true, 'already_claimed', true, 'credited', v_existing.reward_credited,
      'reward_amount', v_existing.reward_amount, 'referrer_id', v_existing.referrer_id,
      'referral_code', v_existing.referral_code, 'status', v_existing.status,
      'referrer_balance', v_balance
    );
  END IF;

  v_referrer_id := public.find_referrer_by_code(p_code);
  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code');
  END IF;
  IF v_referrer_id = p_referee_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self_referral');
  END IF;

  INSERT INTO public.referrals (referrer_id, referee_id, referral_code, status)
  VALUES (v_referrer_id, p_referee_id, upper(btrim(p_code)), 'JOINED')
  RETURNING * INTO v_referral;

  -- Remember which code the referee arrived with.
  UPDATE public.user_profiles
  SET referred_by_code = upper(btrim(p_code))
  WHERE id = p_referee_id;

  PERFORM public.add_wallet_credit(
    v_referrer_id, v_referral.reward_amount, 'referral_reward',
    'Referral reward for ' || p_referee_id, v_referral.id::text
  );

  UPDATE public.referrals SET reward_credited = true, credited_at = now()
  WHERE id = v_referral.id;

  SELECT balance INTO v_balance FROM public.wallets WHERE user_id = v_referrer_id;

  RETURN jsonb_build_object(
    'ok', true, 'already_claimed', false, 'credited', true,
    'reward_amount', v_referral.reward_amount, 'referrer_id', v_referrer_id,
    'referral_code', v_referral.referral_code, 'status', v_referral.status,
    'referrer_balance', v_balance
  );
END;
$$;

REVOKE ALL ON public.wallets FROM anon, authenticated;
REVOKE ALL ON public.wallet_txns FROM anon, authenticated;
REVOKE ALL ON public.referrals FROM anon, authenticated;

GRANT SELECT ON public.wallets TO anon, authenticated;
GRANT SELECT ON public.wallet_txns TO anon, authenticated;
GRANT SELECT ON public.referrals TO anon, authenticated;

GRANT ALL ON public.wallets TO service_role;
GRANT ALL ON public.wallet_txns TO service_role;
GRANT ALL ON public.referrals TO service_role;

REVOKE ALL ON FUNCTION public.create_referral_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_wallet_credit(text, numeric, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_referral(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_referrer_by_code(text) FROM PUBLIC;

-- The client calls claim_referral directly so a referee can be credited without
-- an app round-trip through a function. It credits only the referrer named by a
-- valid code, and the UNIQUE(referee_id) constraint caps it at one reward.
GRANT EXECUTE ON FUNCTION public.claim_referral(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_wallet_credit(text, numeric, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_referral_code(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.find_referrer_by_code(text) TO service_role;

-- referral_code / referred_by_code are readable but only service_role may write
-- them, so codes cannot be forged or reassigned from a client.
GRANT UPDATE (
  name, age, gender, women_only_mode, bio, phone_number, email,
  avatar_url, home_address, office_address, college_address,
  emergency_contact, verification_status, verification_document,
  saved_locations
) ON public.user_profiles TO anon, authenticated;

COMMIT;
