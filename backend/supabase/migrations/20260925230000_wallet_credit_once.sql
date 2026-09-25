-- =============================================================================
-- Wallet top-up crediting.
--
-- The wallet is read-only for clients, so a successful Razorpay payment cannot
-- be turned into a balance by the app. The `wallet-credit` Edge Function verifies
-- the payment server-side and then calls add_wallet_credit() once.
--
-- The unique index on wallet_txns(reference_id) is what makes crediting
-- idempotent: replaying the same payment is a no-op, so a user cannot
-- double-credit by re-opening Razorpay's success callback.
-- =============================================================================

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_txns_reference_unique
  ON public.wallet_txns (reference_id)
  WHERE reference_id IS NOT NULL;

-- Credits are keyed by the payment id, so a repeated call raises and the
-- Edge Function converts that into an "already credited" response.
CREATE OR REPLACE FUNCTION public.credit_wallet_once(
  p_user_id text,
  p_amount numeric,
  p_kind text,
  p_note text,
  p_reference_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet public.wallets;
BEGIN
  PERFORM public.add_wallet_credit(p_user_id, p_amount, p_kind, p_note, p_reference_id);
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_user_id;
  RETURN jsonb_build_object(
    'ok', true,
    'already_credited', false,
    'balance', v_wallet.balance,
    'lifetime_earned', v_wallet.lifetime_earned
  );
END;
$$;

REVOKE ALL ON FUNCTION public.credit_wallet_once(text, numeric, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_wallet_once(text, numeric, text, text, text) TO service_role;

COMMIT;
