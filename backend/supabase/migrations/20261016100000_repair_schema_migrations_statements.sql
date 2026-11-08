-- Repair Supabase CLI migration bookkeeping.
--
-- The linked project's supabase_migrations.schema_migrations.statements column
-- was created as `integer`, but the Supabase CLI records the applied migration
-- SQL there as `text[]`. Without this repair, `supabase db push` applies a
-- migration's DDL and then fails while recording its version, leaving the
-- remote history out of sync.
--
-- Fresh projects already use text[], so the guarded block is a no-op there.
-- The existing integer values are not meaningful SQL, so they are replaced
-- with empty arrays.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'supabase_migrations'
      AND table_name = 'schema_migrations'
      AND column_name = 'statements'
      AND data_type <> 'ARRAY'
  ) THEN
    ALTER TABLE supabase_migrations.schema_migrations
      ALTER COLUMN statements TYPE text[] USING ARRAY[]::text[];
  END IF;
END;
$$;
