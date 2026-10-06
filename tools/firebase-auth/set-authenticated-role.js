'use strict';

/**
 * LinQ — one-time backfill of the `role: "authenticated"` Firebase custom claim.
 *
 * WHY THIS EXISTS
 *   Supabase's Firebase Third-Party Auth inspects the `role` claim on every JWT to
 *   decide which Postgres role to assume. Firebase tokens carry no `role` by
 *   default, so Supabase assigns the `anon` role and the rider never matches
 *   `TO authenticated` RLS policies. Setting { role: "authenticated" } fixes that.
 *   Docs: https://supabase.com/docs/guides/auth/third-party/firebase-auth
 *
 * SAFETY PROPERTIES
 *   * Uses GOOGLE_APPLICATION_CREDENTIALS / Application Default Credentials. It
 *     never reads, embeds, or writes a private key, and never creates a
 *     service-account file.
 *   * MERGES existing custom claims: it reads each user's current claims and only
 *     overwrites `role`. Every other claim is preserved exactly.
 *   * Idempotent: re-running it is harmless.
 *   * Dry-run by default is opt-in via --dry-run; nothing is written unless the
 *     flag is omitted.
 *   * This script does NOT run itself. You run it deliberately.
 *
 * USAGE
 *   Dry run (no writes):
 *     GOOGLE_APPLICATION_CREDENTIALS=/abs/path/sa.json node set-authenticated-role.js --dry-run
 *   Real backfill:
 *     GOOGLE_APPLICATION_CREDENTIALS=/abs/path/sa.json node set-authenticated-role.js
 *   Optional: --project linq-50ed1   (defaults to ADC/FIREBASE project)
 */

const { initializeApp, applicationDefault, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const PAGE_SIZE = 1000; // Firebase listUsers max per page.
const TARGET_ROLE = 'authenticated';
const CLAIM_KEY = 'role';

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run');
  const projectIndex = argv.indexOf('--project');
  const projectId = projectIndex !== -1 ? argv[projectIndex + 1] : undefined;
  return { dryRun, projectId };
}

function identifierFor(user) {
  if (user.email) return user.email;
  if (user.phoneNumber) return user.phoneNumber;
  if (user.providerData && user.providerData.length) {
    const p = user.providerData[0];
    return p.email || p.phoneNumber || p.providerId;
  }
  return '(no email/phone)';
}

async function main() {
  const { dryRun, projectId } = parseArgs(process.argv.slice(2));

  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      ...(projectId ? { projectId } : {}),
    });
  }

  const auth = getAuth();

  console.log('──────────────────────────────────────────────────────────────');
  console.log(`LinQ Firebase custom-claim backfill  (${CLAIM_KEY}: "${TARGET_ROLE}")`);
  console.log(`Mode:    ${dryRun ? 'DRY RUN — no changes will be written' : 'LIVE — claims WILL be updated'}`);
  console.log(`Project: ${projectId ?? '(from Application Default Credentials)'}`);
  console.log('──────────────────────────────────────────────────────────────');

  let nextPageToken;
  let scanned = 0;
  let alreadySet = 0;
  let toUpdate = 0;
  let updated = 0;
  let failed = 0;

  do {
    const page = await auth.listUsers(PAGE_SIZE, nextPageToken);
    nextPageToken = page.pageToken;

    for (const user of page.users) {
      scanned += 1;
      const existing = user.customClaims || {};
      const hasRole = existing[CLAIM_KEY] === TARGET_ROLE;
      const id = identifierFor(user);

      if (hasRole) {
        alreadySet += 1;
        console.log(`  [skip]    ${user.uid}  ${id}  — already "${TARGET_ROLE}"`);
        continue;
      }

      toUpdate += 1;
      // Preserve everything, change only `role`.
      const merged = { ...existing, [CLAIM_KEY]: TARGET_ROLE };

      if (dryRun) {
        const kept = Object.keys(existing).filter((k) => k !== CLAIM_KEY);
        console.log(
          `  [would]   ${user.uid}  ${id}  — set ${CLAIM_KEY}="${TARGET_ROLE}"` +
            (kept.length ? ` (preserving: ${kept.join(', ')})` : ''),
        );
        continue;
      }

      try {
        await auth.setCustomUserClaims(user.uid, merged);
        updated += 1;
        console.log(`  [updated] ${user.uid}  ${id}  — ${CLAIM_KEY}="${TARGET_ROLE}"`);
      } catch (error) {
        failed += 1;
        console.error(
          `  [failed]  ${user.uid}  ${id}  — ${error && error.message ? error.message : error}`,
        );
      }
    }
  } while (nextPageToken);

  console.log('──────────────────────────────────────────────────────────────');
  console.log(`Scanned:            ${scanned}`);
  console.log(`Already correct:    ${alreadySet}`);
  console.log(dryRun ? `Would update:       ${toUpdate}` : `Updated:            ${updated}`);
  console.log(`Failed:             ${failed}`);
  console.log('──────────────────────────────────────────────────────────────');

  if (dryRun) {
    console.log('Dry run complete. Re-run without --dry-run to apply.');
  } else {
    console.log(
      'Done. Existing claims were preserved. Users must obtain a NEW ID token ' +
        '(force refresh) before the role appears; cached tokens are unaffected.',
    );
  }

  // Non-zero exit if any write failed, so CI/scripts can detect it.
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  if (error && error.code === 'app/invalid-credential') {
    console.error(
      'No usable Google credentials found. Set GOOGLE_APPLICATION_CREDENTIALS to the ' +
        'absolute path of a service-account JSON, or run `gcloud auth application-default login`.',
    );
  } else {
    console.error(error);
  }
  process.exit(1);
});
