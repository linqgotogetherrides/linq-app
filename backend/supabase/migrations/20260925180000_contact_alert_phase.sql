-- =============================================================================
-- Distinguish activation alerts from resolution alerts.
--
-- sos-end records a second alert per contact telling them the emergency is
-- over. Without a phase column those rows are indistinguishable from the
-- original SOS alerts in the admin dashboard.
-- =============================================================================

BEGIN;

ALTER TABLE public.sos_contact_alerts
  ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'activation';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sos_contact_alerts_phase_check'
  ) THEN
    ALTER TABLE public.sos_contact_alerts
      ADD CONSTRAINT sos_contact_alerts_phase_check
      CHECK (phase IN ('activation', 'resolution', 'test'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS sos_contact_alerts_sos_phase_idx
  ON public.sos_contact_alerts (sos_id, phase, attempted_at DESC);

COMMIT;
