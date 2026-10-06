// Account deletion.
//
// Apple App Store guideline 5.1.1(v) and Google Play both require an in-app
// way to delete an account and its data. A profile deletion alone is not
// enough: private SOS evidence (photos and audio) lives in Storage and is not
// covered by any database cascade, so it has to be purged here explicitly
// before the profile row is removed.
//
// Deleting the user_profiles row cascades to every table that references it
// (wallets, wallet_txns, referrals, rides, ride_requests, notifications,
// emergency_contacts, sos_incidents, sos_locations, sos_evidence rows). The
// only thing that does NOT cascade is the Storage objects, handled below.
//
// The identifier is the Firebase UID the client already sends for every other
// privileged operation. A leaked anon key cannot be used to delete another
// user's account without also knowing that user's UID.

import {
  EVIDENCE_BUCKET,
  errorResponse,
  jsonResponse,
  optionsResponse,
  readJsonBody,
  requireClientAuthorization,
  requireUserId,
  SosError,
  supabaseAdmin,
} from "../_shared/sos.ts";

/** Collects every file path under a Storage prefix, one folder deep. */
async function listEvidencePaths(
  db: ReturnType<typeof supabaseAdmin>,
  sosId: string,
): Promise<string[]> {
  const paths: string[] = [];
  const { data: entries, error } = await db.storage.from(EVIDENCE_BUCKET).list(sosId, {
    limit: 1000,
  });
  if (error || !entries) return paths;

  for (const entry of entries) {
    const entryPath = `${sosId}/${entry.name}`;
    // A folder entry has no id; recurse into it once, which covers the
    // `${sosId}/photos/...` and `${sosId}/audio/...` layouts.
    if (!entry.id) {
      const { data: nested } = await db.storage.from(EVIDENCE_BUCKET).list(entryPath, {
        limit: 1000,
      });
      for (const file of nested ?? []) {
        if (file.id) paths.push(`${entryPath}/${file.name}`);
      }
    } else {
      paths.push(entryPath);
    }
  }
  return paths;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return errorResponse(
      new SosError(405, "method_not_allowed", "Method not allowed"),
    );
  }

  try {
    requireClientAuthorization(req);
    const body = await readJsonBody(req);
    const userId = requireUserId(body);

    const db = supabaseAdmin();

    // 1. Purge private SOS evidence from Storage. Best effort: a Storage hiccup
    //    must not strand the rider in an account they asked to delete, so the
    //    profile deletion still proceeds and the failures are logged.
    const { data: incidents } = await db
      .from("sos_incidents")
      .select("id")
      .eq("user_id", userId);
    const sosIds = (incidents ?? []).map((row) => (row as { id: string }).id);

    for (const sosId of sosIds) {
      const paths = await listEvidencePaths(db, sosId);
      if (paths.length) {
        const { error: removeError } = await db.storage.from(EVIDENCE_BUCKET).remove(paths);
        if (removeError) console.error(`account-deletion: evidence purge failed for ${sosId}:`, removeError.message);
      }
    }

    // 2. Delete the profile. FKs cascade to the rest of the account's data.
    const { error: deleteError } = await db.from("user_profiles").delete().eq("id", userId);
    if (deleteError) {
      console.error("account-deletion: profile delete failed:", deleteError.message);
      return errorResponse(
        new SosError(502, "delete_failed", "Could not delete the account. Please try again."),
      );
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});
