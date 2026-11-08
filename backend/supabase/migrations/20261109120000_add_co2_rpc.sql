-- Add a tiny RPC that adds CO₂ savings to a user profile row.
-- Idempotent: running it multiple times does not break anything.

BEGIN;

-- Create or replace the function
CREATE OR REPLACE FUNCTION public.add_co2_to_profile(
  p_user_id text,
  p_amount numeric
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_profiles
  SET co2_saved_kg = co2_saved_kg + p_amount
  WHERE id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.add_co2_to_profile IS
  'Adds the given amount (kg) to the rider''s cumulative CO₂ savings.';

-- Grant execution to the anon/authenticated clients if desired; currently
-- only service_role should run it (the complete-ride function uses service_role).
GRANT EXECUTE ON FUNCTION public.add_co2_to_profile TO service_role;

COMMIT;