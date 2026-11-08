-- =============================================================================
-- Paid plan persistence.
--
-- PROBLEM
--   `upgradePlan()` only changed React state. A rider who paid for the Yearly,
--   2 Year, or milestone annual plan got access until the next app launch, then
--   was silently back on the free tier. The payment row recorded the product
--   but not who bought it, so there was no server-side entitlement to restore.
--
-- WHAT THIS ADDS
--   user_profiles.plan / plan_expires_at  - the current entitlement the app reads
--   plan_purchases                        - immutable ledger, one row per payment
--   grant_plan_for_payment()              - idempotent, service-role-only grant
--
-- A payment is applied exactly once because razorpay_order_id is UNIQUE in the
-- ledger. Re-delivering the same successful payment (client verify + webhook +
-- callback) extends nothing and cannot lose paid time.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Current entitlement on the profile
-- -----------------------------------------------------------------------------
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz;

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_plan_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_plan_check
  CHECK (plan IN ('free', 'yearly', 'twoYear'));

COMMENT ON COLUMN public.user_profiles.plan IS
  'Active subscription tier. Only the payment backend may change this.';
COMMENT ON COLUMN public.user_profiles.plan_expires_at IS
  'When the paid tier ends. NULL for free accounts.';

-- -----------------------------------------------------------------------------
-- 2. Purchase ledger
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  product text NOT NULL,
  plan text NOT NULL,
  amount integer NOT NULL CHECK (amount >= 100),
  currency text NOT NULL DEFAULT 'INR',
  razorpay_order_id text NOT NULL UNIQUE,
  razorpay_payment_id text UNIQUE,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_purchases_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  CONSTRAINT plan_purchases_product_check
    CHECK (product IN ('yearly', 'two_year', 'game_annual')),
  CONSTRAINT plan_purchases_plan_check
    CHECK (plan IN ('yearly', 'twoYear'))
);

CREATE INDEX IF NOT EXISTS plan_purchases_user_expires_idx
  ON public.plan_purchases (user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS plan_purchases_payment_idx
  ON public.plan_purchases (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

COMMENT ON TABLE public.plan_purchases IS
  'Immutable ledger of successful plan payments. One row per Razorpay order.';

-- -----------------------------------------------------------------------------
-- 3. Idempotent grant
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_plan_for_payment(
  p_order_id text,
  p_payment_id text,
  p_user_id text,
  p_product text,
  p_amount integer,
  p_currency text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.user_profiles;
  v_purchase public.plan_purchases;
  v_plan text;
  v_duration interval;
  v_paid_at timestamptz := now();
  v_base timestamptz;
  v_expires timestamptz;
BEGIN
  IF p_order_id IS NULL OR btrim(p_order_id) = '' THEN
    RAISE EXCEPTION 'order id is required' USING ERRCODE = '22023';
  END IF;
  IF p_user_id IS NULL OR btrim(p_user_id) = '' THEN
    RAISE EXCEPTION 'user id is required' USING ERRCODE = '22023';
  END IF;

  -- Serialise concurrent deliveries for the same rider (client verify + webhook).
  SELECT * INTO v_profile
  FROM public.user_profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile % not found', p_user_id USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_purchase
  FROM public.plan_purchases
  WHERE razorpay_order_id = btrim(p_order_id);

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_applied', true,
      'plan', v_profile.plan,
      'plan_expires_at', v_profile.plan_expires_at,
      'expires_at', v_purchase.expires_at
    );
  END IF;

  CASE p_product
    WHEN 'yearly' THEN
      v_plan := 'yearly';
      v_duration := interval '1 year';
    WHEN 'game_annual' THEN
      v_plan := 'yearly';
      v_duration := interval '1 year';
    WHEN 'two_year' THEN
      v_plan := 'twoYear';
      v_duration := interval '2 years';
    ELSE
      RAISE EXCEPTION 'product % is not a subscription plan', p_product
        USING ERRCODE = '22023';
  END CASE;

  -- Never shorten a better entitlement. A yearly renewal bought while the
  -- 2 Year plan is still active keeps the 2 Year label but extends its end date.
  IF v_profile.plan = 'twoYear' AND v_profile.plan_expires_at > v_paid_at THEN
    v_plan := 'twoYear';
  END IF;

  -- An early renewal extends from the existing end date, not from today, so no
  -- paid days are lost. An expired plan restarts from the payment time.
  v_base := GREATEST(COALESCE(v_profile.plan_expires_at, v_paid_at), v_paid_at);
  v_expires := v_base + v_duration;

  INSERT INTO public.plan_purchases (
    user_id, product, plan, amount, currency,
    razorpay_order_id, razorpay_payment_id, purchased_at, expires_at
  )
  VALUES (
    p_user_id,
    p_product,
    v_plan,
    p_amount,
    UPPER(COALESCE(NULLIF(btrim(p_currency), ''), 'INR')),
    btrim(p_order_id),
    NULLIF(btrim(COALESCE(p_payment_id, '')), ''),
    v_paid_at,
    v_expires
  )
  RETURNING * INTO v_purchase;

  UPDATE public.user_profiles
  SET plan = v_plan,
      plan_expires_at = v_expires
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'already_applied', false,
    'plan', v_plan,
    'plan_expires_at', v_expires,
    'expires_at', v_expires
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Privilege guard
--
-- Column-level grants on user_profiles already exclude plan/plan_expires_at in
-- the hardened schema, but the guard is repeated here so a future grant cannot
-- quietly let a client award itself a subscription.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_user_profile_app_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text := COALESCE(auth.role(), 'anon');
BEGIN
  IF caller_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.app_role IS DISTINCT FROM 'user' THEN
      RAISE EXCEPTION 'app_role cannot be set by this client' USING ERRCODE = '42501';
    END IF;
    IF NEW.plan IS DISTINCT FROM 'free' THEN
      RAISE EXCEPTION 'plan cannot be set by this client' USING ERRCODE = '42501';
    END IF;
    IF NEW.plan_expires_at IS NOT NULL THEN
      RAISE EXCEPTION 'plan_expires_at cannot be set by this client' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.app_role IS DISTINCT FROM OLD.app_role THEN
      RAISE EXCEPTION 'app_role can only be changed by the LinQ backend' USING ERRCODE = '42501';
    END IF;
    IF NEW.plan IS DISTINCT FROM OLD.plan
       OR NEW.plan_expires_at IS DISTINCT FROM OLD.plan_expires_at THEN
      RAISE EXCEPTION 'plan can only be changed by the LinQ backend' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- kyc_status is set by the kyc-webhook function only.
  IF TG_OP = 'UPDATE' AND NEW.kyc_status IS DISTINCT FROM OLD.kyc_status THEN
    RAISE EXCEPTION 'kyc_status can only be changed by the LinQ backend' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_guard_app_role ON public.user_profiles;
CREATE TRIGGER user_profiles_guard_app_role
BEFORE INSERT OR UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_user_profile_app_role();

-- -----------------------------------------------------------------------------
-- 5. Access control
-- -----------------------------------------------------------------------------
ALTER TABLE public.plan_purchases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.plan_purchases FROM anon, authenticated;
GRANT ALL ON public.plan_purchases TO service_role;

REVOKE ALL ON FUNCTION public.grant_plan_for_payment(text, text, text, text, integer, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_plan_for_payment(text, text, text, text, integer, text)
  TO service_role;

-- Keep the payment lookup fast for the verify/webhook path.
CREATE INDEX IF NOT EXISTS payments_user_product_idx
  ON public.payments (user_id, product)
  WHERE user_id IS NOT NULL;

COMMIT;
