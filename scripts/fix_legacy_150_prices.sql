-- ---------------------------------------------------------------------------
-- Legacy Rs 150 prices
--
-- Before the price fix, Create Ride defaulted the slider to 150 and published
-- that value if the rider never dragged it. Those rides are sitting in the
-- database with a price nobody chose. The app no longer writes 150, but it also
-- cannot rewrite history: the number stored on an old row is the only record of
-- what that post says.
--
-- Run the REPORT first. It does not write anything.
-- ---------------------------------------------------------------------------

-- REPORT: which rows are suspect, and what they currently claim.
SELECT
  id,
  user_id,
  price_per_seat,
  status,
  created_at,
  pickup_address,
  dropoff_address
FROM public.rides
WHERE price_per_seat = 150
ORDER BY created_at DESC;


-- ---------------------------------------------------------------------------
-- FIX, only once the report above has been read.
--
-- This nulls the price rather than inventing a replacement. A null price is
-- honest ("not set") and the UI already hides it, so a wrong Rs 0 or a guessed
-- number never reaches a rider. The owner can then set the real figure with
-- Edit the Ride.
--
-- Scope it to the ids the report returned. Do not run it unscoped: a rider may
-- legitimately have chosen 150 themselves.
--
--   UPDATE public.rides
--      SET price_per_seat = NULL
--    WHERE id IN (
--      '<paste-ids-from-the-report-here>'
--    );
--
-- To confirm afterwards:
--
--   SELECT count(*) FROM public.rides WHERE price_per_seat = 150;
-- ---------------------------------------------------------------------------
