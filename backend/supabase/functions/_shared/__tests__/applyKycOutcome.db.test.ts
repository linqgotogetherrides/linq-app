/**
 * Integration tests for the apply_kyc_outcome RPC, run against a real
 * PostgreSQL engine (PGlite: PostgreSQL 18 compiled to WebAssembly).
 *
 * These exist because the defects they cover cannot be observed from unit
 * tests. Atomic rollback, row-level locking, CHECK constraints, RLS and
 * GRANT/REVOKE are all database behaviours; asserting them in TypeScript
 * would prove nothing.
 *
 * Run with:  node --test --experimental-strip-types <this file>
 * Requires the workspace's PostgreSQL harness; see readHarness() below.
 */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
// __tests__ -> _shared -> functions -> supabase -> migrations
const MIGRATIONS = resolve(HERE, '../../../migrations');

/**
 * PGlite is real PostgreSQL compiled to WebAssembly. It is deliberately NOT a
 * project dependency -- installing it into the repo would add a WASM Postgres
 * to every `npm install` for a suite most contributors will not run.
 *
 * Point PGLITE_PATH at an installed copy to enable this suite:
 *
 *   mkdir -p /tmp/kyc-pgtest && cd /tmp/kyc-pgtest
 *   npm init -y && npm install @electric-sql/pglite
 *   PGLITE_PATH=/tmp/kyc-pgtest/node_modules/@electric-sql/pglite \
 *     node --test --experimental-strip-types <this file>
 *
 * Without it the suite is SKIPPED, not failed, so the pure unit tests still run.
 */
async function tryLoadPGlite() {
  const target = process.env.PGLITE_PATH;
  if (!target) return null;
  try {
    // ESM cannot import a bare directory (ERR_UNSUPPORTED_DIR_IMPORT), so
    // resolve the package through a CommonJS require rooted at the install.
    const require = createRequire(`${target}/`);
    return require('@electric-sql/pglite').PGlite ?? null;
  } catch {
    return null;
  }
}

const PGLITE = await tryLoadPGlite();
const SKIP = PGLITE
  ? false
  : 'PGlite harness not available; set PGLITE_PATH to run the database suite';

let db;

/** Minimal schema slice: just the columns and constraints the RPC touches. */
const SCHEMA = `
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE TABLE public.user_profiles (
  id                   text PRIMARY KEY,
  verification_status  text NOT NULL DEFAULT 'not_verified'
    CHECK (verification_status IN ('not_verified','pending','verified')),
  verification_document text
    CHECK (verification_document IS NULL OR verification_document IN ('aadhaar','pan','dl')),
  kyc_status           text NOT NULL DEFAULT 'not_verified'
    CHECK (kyc_status IN ('not_verified','pending','verified')),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.kyc_sessions (
  verification_id text PRIMARY KEY,
  user_id         text NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  doc_type        text NOT NULL CHECK (doc_type IN ('aadhaar','pan','dl')),
  reference_id    bigint,
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','verified','failed','expired')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX kyc_sessions_one_pending_per_doc
  ON public.kyc_sessions (user_id, doc_type) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER kyc_sessions_set_updated_at
BEFORE UPDATE ON public.kyc_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
`;

/** The real RPC, read from the migration so the test cannot drift from it. */
function loadRpcSql() {
  const raw = readFileSync(
    resolve(MIGRATIONS, '20261015090000_apply_kyc_outcome.sql'),
    'utf8',
  );
  // Strip the transaction wrapper and the COMMENT/REVOKE statements that need
  // catalog objects the harness may not have; keep the function definition.
  const start = raw.indexOf('CREATE OR REPLACE FUNCTION public.apply_kyc_outcome');
  const end = raw.indexOf('REVOKE ALL ON FUNCTION public.apply_kyc_outcome(text, text) FROM PUBLIC;');
  assert.ok(start > -1 && end > start, 'RPC definition not found in migration');
  return raw.slice(start, end);
}

async function apply(verificationId, outcome) {
  return db.query('select * from public.apply_kyc_outcome($1, $2)', [verificationId, outcome]);
}

async function sessionRow(verificationId) {
  const r = await db.query('select * from public.kyc_sessions where verification_id = $1', [verificationId]);
  return r.rows[0] ?? null;
}

async function profileRow(id) {
  const r = await db.query('select * from public.user_profiles where id = $1', [id]);
  return r.rows[0] ?? null;
}

async function seedUser(id) {
  await db.query('insert into public.user_profiles (id) values ($1)', [id]);
}

async function seedSession(verificationId, userId, docType, status = 'pending') {
  await db.query(
    'insert into public.kyc_sessions (verification_id, user_id, doc_type, status) values ($1,$2,$3,$4)',
    [verificationId, userId, docType, status],
  );
}

before(async () => {
  if (!PGLITE) return;
});

beforeEach(async () => {
  if (!PGLITE) return;
  db = new PGLITE();
  await db.exec(SCHEMA);
  await db.exec(loadRpcSql());
});

describe('apply_kyc_outcome — success path', { skip: SKIP }, () => {
  test('verifies the session and the profile in one call', async () => {
    await seedUser('u1');
    await seedSession('v1', 'u1', 'pan');

    const r = await apply('v1', 'verified');
    assert.equal(r.rows[0].changed, true);
    assert.equal(r.rows[0].resolved_user_id, 'u1');

    assert.equal((await sessionRow('v1')).status, 'verified');
    const p = await profileRow('u1');
    assert.equal(p.verification_status, 'verified');
    assert.equal(p.kyc_status, 'verified');
    assert.equal(p.verification_document, 'pan');
  });

  test('addresses the profile only through the mapping, ignoring any hint', async () => {
    await seedUser('owner');
    await seedUser('victim');
    await seedSession('v1', 'owner', 'aadhaar');

    await apply('v1', 'verified');

    // The victim must be untouched: the RPC has no user id parameter at all.
    const victim = await profileRow('victim');
    assert.equal(victim.verification_status, 'not_verified');
    assert.equal(victim.kyc_status, 'not_verified');
  });

  test('bumps user_profiles.updated_at', async () => {
    await seedUser('u1');
    await seedSession('v1', 'u1', 'pan');
    const before = (await profileRow('u1')).updated_at;

    await db.query("update public.user_profiles set updated_at = '2000-01-01' where id='u1'");
    await apply('v1', 'verified');

    const after = (await profileRow('u1')).updated_at;
    assert.notEqual(after.toISOString().slice(0, 4), '2000');
    assert.notDeepEqual(after, before);
  });
});

describe('apply_kyc_outcome — C1 atomic rollback and retry', { skip: SKIP }, () => {
  test('rolls the session back when the profile update fails, and allows a later retry', async () => {
    await seedUser('u1');
    await seedSession('v1', 'u1', 'pan');

    // Force the profile write to fail. This is the exact failure mode that
    // previously left the session committed as 'verified' and stranded the
    // rider forever.
    await db.exec(`
      CREATE FUNCTION public.boom() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'simulated profile write failure'; END $$;
      CREATE TRIGGER t_boom BEFORE UPDATE ON public.user_profiles
      FOR EACH ROW EXECUTE FUNCTION public.boom();
    `);

    await assert.rejects(() => apply('v1', 'verified'), /simulated profile write failure/);

    // THE CRITICAL ASSERTION: the session must NOT have advanced. Under the old
    // two-transaction handler it would read 'verified' here, and the retry
    // below would short-circuit and never write the profile.
    assert.equal(
      (await sessionRow('v1')).status,
      'pending',
      'session must roll back with the profile write',
    );
    assert.equal((await profileRow('u1')).verification_status, 'not_verified');

    // Remove the fault and retry: this must now succeed.
    await db.exec('DROP TRIGGER t_boom ON public.user_profiles;');
    const retry = await apply('v1', 'verified');

    assert.equal(retry.rows[0].changed, true, 'retry must be able to complete the work');
    assert.equal((await sessionRow('v1')).status, 'verified');
    assert.equal((await profileRow('u1')).verification_status, 'verified');
  });

  test('a CHECK violation on the profile rolls the session back too', async () => {
    await seedUser('u1');
    await seedSession('v1', 'u1', 'pan');

    // Point the session at a document value the profile CHECK rejects, by
    // disabling the session-level check for this one row update.
    await db.exec('ALTER TABLE public.kyc_sessions DROP CONSTRAINT kyc_sessions_doc_type_check');
    await db.query("update public.kyc_sessions set doc_type='passport' where verification_id='v1'");

    // user_profiles.verification_document rejects 'passport'.
    await assert.rejects(() => apply('v1', 'verified'));

    assert.equal((await sessionRow('v1')).status, 'pending', 'session rolled back');
    assert.equal((await profileRow('u1')).verification_status, 'not_verified');
  });
});

describe('apply_kyc_outcome — expiry never verifies', { skip: SKIP }, () => {
  test('marks only the session, leaves the profile alone', async () => {
    await seedUser('u1');
    await seedSession('v1', 'u1', 'pan');

    const r = await apply('v1', 'expired');
    assert.equal(r.rows[0].changed, true);

    assert.equal((await sessionRow('v1')).status, 'expired');
    const p = await profileRow('u1');
    assert.equal(p.verification_status, 'not_verified', 'expiry must not verify');
    assert.equal(p.kyc_status, 'not_verified');
  });

  test('a late expiry cannot un-verify an already verified rider', async () => {
    await seedUser('u1');
    await seedSession('v1', 'u1', 'pan');
    await apply('v1', 'verified');

    const r = await apply('v1', 'expired');
    assert.equal(r.rows[0].changed, false, 'verified is sticky');
    assert.equal((await sessionRow('v1')).status, 'verified');
    assert.equal((await profileRow('u1')).verification_status, 'verified');
  });
});

describe('apply_kyc_outcome — idempotency and duplicates', { skip: SKIP }, () => {
  test('duplicate delivery is a no-op that still reports success', async () => {
    await seedUser('u1');
    await seedSession('v1', 'u1', 'pan');

    const first = await apply('v1', 'verified');
    const second = await apply('v1', 'verified');
    const third = await apply('v1', 'verified');

    assert.equal(first.rows[0].changed, true);
    assert.equal(second.rows[0].changed, false);
    assert.equal(third.rows[0].changed, false);
    // Crucially the user id is still reported, so the handler can tell a
    // duplicate apart from an unknown session and log the right reason code.
    assert.equal(third.rows[0].resolved_user_id, 'u1');
    assert.equal((await profileRow('u1')).verification_status, 'verified');
  });

  test('the session row is locked FOR UPDATE, so a second delivery serialises behind it', async () => {
    // LIMITATION, stated plainly: PGlite is an in-process, single-connection
    // engine, so two genuinely concurrent sessions cannot be opened and true
    // lock contention cannot be exercised here. What IS verified is that the
    // locking clause is present in the shipped SQL and is therefore still doing
    // its job; removing it would fail this test. Real cross-connection
    // concurrency must be confirmed once against a hosted Postgres.
    const sql = loadRpcSql();
    assert.match(
      sql,
      /select\s+\*\s+into\s+v_session[\s\S]*for\s+update/i,
      'apply_kyc_outcome must lock the session row with FOR UPDATE',
    );

    // The observable consequence we CAN check: once one delivery has applied,
    // a second delivery in the serialized order is a clean no-op.
    await seedUser('u1');
    await seedSession('v1', 'u1', 'pan');
    await apply('v1', 'verified');
    const second = await apply('v1', 'verified');
    assert.equal(second.rows[0].changed, false);
    assert.equal((await profileRow('u1')).verification_status, 'verified');
  });
});

describe('apply_kyc_outcome — unknown and invalid input', { skip: SKIP }, () => {
  test('unknown verification id reports no user and changes nothing', async () => {
    await seedUser('u1');
    const r = await apply('does-not-exist', 'verified');

    assert.equal(r.rows[0].changed, false);
    assert.equal(r.rows[0].resolved_user_id, null);
    assert.equal((await profileRow('u1')).verification_status, 'not_verified');
  });

  test('an unknown id never creates a session row', async () => {
    await apply('ghost', 'verified');
    const r = await db.query('select count(*)::int as n from public.kyc_sessions');
    assert.equal(r.rows[0].n, 0);
  });

  test('rejects any outcome outside the approved terminal set', async () => {
    await seedUser('u1');
    await seedSession('v1', 'u1', 'pan');

    for (const bad of ['in_progress', 'ignored', 'pending', 'failed', '', null]) {
      await assert.rejects(
        () => apply('v1', bad),
        /unsupported outcome/,
        `outcome ${JSON.stringify(bad)} must be rejected`,
      );
    }
    // Nothing leaked through the failed attempts.
    assert.equal((await sessionRow('v1')).status, 'pending');
    assert.equal((await profileRow('u1')).verification_status, 'not_verified');
  });
});

describe('apply_kyc_outcome — late success from an older session (req 10)', { skip: SKIP }, () => {
  test('a late success does not regress verification_document', async () => {
    await seedUser('u1');
    // Newer session verifies first.
    await seedSession('v_new', 'u1', 'aadhaar');
    await apply('v_new', 'verified');
    assert.equal((await profileRow('u1')).verification_document, 'aadhaar');

    // An older PAN session's success arrives late. The rider was already
    // verified, so the document on display must not flip back.
    await seedSession('v_old', 'u1', 'pan');
    const r = await apply('v_old', 'verified');

    assert.equal(r.rows[0].changed, true);
    const p = await profileRow('u1');
    assert.equal(p.verification_status, 'verified');
    assert.equal(
      p.verification_document,
      'aadhaar',
      'first verified document wins',
    );
    // Its own session is still recorded as verified.
    assert.equal((await sessionRow('v_old')).status, 'verified');
  });
});

describe('apply_kyc_outcome — execution rights', { skip: SKIP }, () => {
  test('PUBLIC, anon and authenticated cannot execute', async () => {
    // Apply the grants exactly as the migration does.
    await db.exec('REVOKE ALL ON FUNCTION public.apply_kyc_outcome(text, text) FROM PUBLIC');
    await db.exec('REVOKE ALL ON FUNCTION public.apply_kyc_outcome(text, text) FROM anon');
    await db.exec('REVOKE ALL ON FUNCTION public.apply_kyc_outcome(text, text) FROM authenticated');
    await db.exec('GRANT EXECUTE ON FUNCTION public.apply_kyc_outcome(text, text) TO service_role');

    const has = async (role) => {
      const r = await db.query(
        `select has_function_privilege($1, 'public.apply_kyc_outcome(text,text)', 'EXECUTE') as ok`,
        [role],
      );
      return r.rows[0].ok;
    };

    assert.equal(await has('anon'), false, 'anon must not execute');
    assert.equal(await has('authenticated'), false, 'authenticated must not execute');
    assert.equal(await has('service_role'), true, 'service_role must execute');
  });

  test('a client role cannot verify a profile even if it reaches the table', async () => {
    await seedUser('u1');
    await seedSession('v1', 'u1', 'pan');

    await db.exec('REVOKE ALL ON public.kyc_sessions FROM PUBLIC, anon, authenticated');
    await db.exec('REVOKE ALL ON public.user_profiles FROM PUBLIC, anon, authenticated');
    await db.exec('ALTER TABLE public.kyc_sessions ENABLE ROW LEVEL SECURITY');
    await db.exec('ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY');

    // SET ROLE and the UPDATE must be separate statements: the driver rejects a
    // multi-command prepared statement.
    await db.exec('SET ROLE anon');
    await assert.rejects(
      () => db.query("update public.user_profiles set kyc_status='verified' where id='u1'"),
      /permission denied/i,
    );
    await db.exec('RESET ROLE');
    assert.equal((await profileRow('u1')).kyc_status, 'not_verified');
  });
});