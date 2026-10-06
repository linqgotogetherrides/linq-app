'use strict';

/**
 * LinQ — Firebase Cloud Functions that keep the Supabase role claim on users.
 *
 * WHAT THIS DOES
 *   When a new Firebase Auth user is created, add the custom claim
 *   { role: "authenticated" } so Supabase's Firebase Third-Party Auth assigns
 *   the `authenticated` Postgres role (instead of `anon`) when it verifies that
 *   user's ID token. Existing claims are preserved.
 *
 * WHY onCreate (and not a blocking function)
 *   Blocking functions (beforeUserCreated / beforeUserSignedIn) are the cleanest
 *   way, but they require Firebase Authentication with Identity Platform.
 *   The classic Auth `onCreate` trigger below works on the standard product and
 *   needs no Identity Platform. Its only trade-off: it runs asynchronously, so
 *   the FIRST ID token a brand-new user holds may not yet contain the claim —
 *   force-refresh once after signup (see the app's getIdToken(true)).
 *
 * DEPLOYMENT
 *   Requires the Blaze (pay-as-you-go) plan. DO NOT deploy from automation;
 *   see the runbook in the surrounding conversation. Deploy manually with:
 *     cd tools/firebase-functions && firebase deploy --only functions
 *
 * SECRETS
 *   None. This uses the Cloud Functions runtime's own service account; no key
 *   file is read, embedded, or written.
 *
 * This function does not touch the LinQ app, KYC, Razorpay, SOS or rides.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const TARGET_ROLE = 'authenticated';

exports.setSupabaseRoleOnCreate = functions.auth.user().onCreate(async (user) => {
  try {
    const existing = user.customClaims || {};
    // Idempotent and non-destructive: only set `role`, keep everything else.
    if (existing.role === TARGET_ROLE) {
      console.log(`setSupabaseRoleOnCreate: ${user.uid} already has role=${TARGET_ROLE}`);
      return;
    }

    await admin.auth().setCustomUserClaims(user.uid, {
      ...existing,
      role: TARGET_ROLE,
    });

    const id = user.email || user.phoneNumber || '(no email/phone)';
    console.log(`setSupabaseRoleOnCreate: set role=${TARGET_ROLE} for ${user.uid} ${id}`);
  } catch (error) {
    console.error(`setSupabaseRoleOnCreate failed for ${user.uid}:`, error);
    throw error;
  }
});
