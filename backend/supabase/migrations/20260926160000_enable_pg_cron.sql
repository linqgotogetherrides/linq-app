-- =============================================================================
-- Enable pg_cron and schedule close_expired_rides()
--
-- 20260926150000 created close_expired_rides() but wrapped its cron.schedule()
-- call in a guard for an extension that was not installed, so the migration
-- applied cleanly and silently registered nothing. Expired rides were never
-- going to close on their own.
--
-- pg_cron is available (1.6.4) but was not enabled on this project. This
-- installs it and schedules the job for real, then verifies it landed.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule only if it is not already registered.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'close-expired-rides') THEN
    PERFORM cron.schedule(
      'close-expired-rides',
      '7 * * * *',
      'SELECT public.close_expired_rides()'
    );
  END IF;
END;
$$;

COMMIT;
