-- =============================================================================
-- Corrections for the referrals/wallet migration.
--
-- 1. RLS was enabled on wallets / wallet_txns / referrals but no SELECT policy
--    was created, so the anon client read zero rows: the wallet row existed but
--    appeared to be missing. Writes stay forbidden (that is the part that
--    matters), so these policies are read-only.
--
-- 2. referral_code was only backfilled for profiles that existed at migration
--    time. New signups got NULL, so they could not share a code. A trigger now
--    assigns a unique code on INSERT.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Read-only policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS wallets_client_read ON public.wallets;
CREATE POLICY wallets_client_read
  ON public.wallets
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS wallet_txns_client_read ON public.wallet_txns;
CREATE POLICY wallet_txns_client_read
  ON public.wallet_txns
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS referrals_client_read ON public.referrals;
CREATE POLICY referrals_client_read
  ON public.referrals
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Deliberately NO insert/update/delete policies: balances and referral rewards
-- change only through add_wallet_credit() / claim_referral().

-- -----------------------------------------------------------------------------
-- Assign a referral code to every new profile
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_referral_code_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_prefix text;
  v_code text;
  v_name text;
  v_attempt int := 0;
BEGIN
  IF NEW.referral_code IS NOT NULL AND btrim(NEW.referral_code) <> '' THEN
    RETURN NEW;
  END IF;

  v_name := COALESCE(NULLIF(btrim(NEW.name), ''), 'LINQ');
  v_prefix := upper(regexp_replace(left(v_name, 4), '[^A-Za-z]', '', 'g'));
  IF v_prefix = '' THEN
    v_prefix := 'LINQ';
  END IF;

  LOOP
    v_code := 'LINQ-' || v_prefix || '-' || upper(encode(extensions.gen_random_bytes(3), 'hex'));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.user_profiles p WHERE p.referral_code = v_code
    );
    v_attempt := v_attempt + 1;
    EXIT WHEN v_attempt > 8;
  END LOOP;

  NEW.referral_code := v_code;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_assign_referral_code ON public.user_profiles;
CREATE TRIGGER user_profiles_assign_referral_code
BEFORE INSERT ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.assign_referral_code_on_signup();

-- Backfill anything still missing.
UPDATE public.user_profiles p
SET referral_code = public.create_referral_code(p.id)
WHERE p.referral_code IS NULL;

COMMIT;
