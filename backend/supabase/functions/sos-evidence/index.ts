// SOS evidence: private storage + metadata.
//
// The `sos-evidence` bucket is private. There are no public URLs and the mobile
// client has no storage write role. Instead:
//
//   sign_upload  -> mints a short-lived signed upload URL for ONE path and
//                   creates a PENDING sos_evidence row (owner, ACTIVE incident)
//   record_result-> marks that row UPLOADED / FAILED / SKIPPED_UNAVAILABLE
//   list         -> returns metadata rows (no file bytes)
//   sign_download-> mints short-lived signed READ urls (owner or safety operator)
//
// Object layout matches the required structure:
//   sos-evidence/{sos_id}/photos/...
//   sos-evidence/{sos_id}/audio/...
//
// HONESTY RULE: `capture_mode` is written by the client and validated here
// against an allow-list. 'background_native' is only ever recorded when a real
// native background module reports a capture. The app never claims a background
// capture it did not perform.

import {
  EVIDENCE_BUCKET,
  SosError,
  errorResponse,
  jsonResponse,
  optionalNumber,
  optionalString,
  optionsResponse,
  readJsonBody,
  requireClientAuthorization,
  requireString,
  requireUserId,
  supabaseAdmin,
} from "../_shared/sos.ts";

const CAPTURE_MODES = new Set(["foreground", "foreground_interactive", "background_native"]);
const KINDS = new Set(["photo", "audio"]);
const CONTENT_TYPES: Record<string, string[]> = {
  photo: ["image/jpeg", "image/png", "image/heic"],
  audio: ["audio/m4a", "audio/mp4", "audio/aac", "audio/mpeg", "audio/ogg"],
};

function sanitizeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
}

async function assertCanAccess(
  admin: ReturnType<typeof supabaseAdmin>,
  sosId: string,
  actorId: string,
): Promise<{ id: string; user_id: string; status: string; reference_code: string }> {
  const { data: incident, error } = await admin
    .from("sos_incidents")
    .select("id, user_id, status, reference_code")
    .eq("id", sosId)
    .maybeSingle();

  if (error) throw new SosError(502, "incident_lookup_failed", "Unable to read the SOS incident");
  if (!incident) throw new SosError(404, "incident_not_found", "SOS incident not found");
  if (incident.user_id === actorId) return incident;

  const { data: operator } = await admin.rpc("is_sos_operator", { p_user_id: actorId });
  if (!operator) {
    throw new SosError(403, "not_permitted", "You do not have access to this SOS evidence");
  }
  return incident;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    requireClientAuthorization(req);
    const body = await readJsonBody(req);
    const admin = supabaseAdmin();

    const action = requireString(body, "action", { maxLength: 24 });
    const actorId = requireUserId(body);
    const sosId = requireString(body, "sos_id", { maxLength: 64 });

    const incident = await assertCanAccess(admin, sosId, actorId);

    // -----------------------------------------------------------------
    if (action === "sign_upload") {
      if (incident.status !== "ACTIVE") {
        throw new SosError(
          409,
          "incident_not_active",
          "Evidence can only be collected while the SOS incident is ACTIVE.",
        );
      }

      const kind = requireString(body, "kind", { maxLength: 8 });
      if (!KINDS.has(kind)) throw new SosError(400, "invalid_kind", "kind must be photo or audio");

      const contentType = requireString(body, "content_type", { maxLength: 80 });
      if (!CONTENT_TYPES[kind].includes(contentType)) {
        throw new SosError(400, "invalid_content_type", `Unsupported ${kind} content type`);
      }

      const captureMode = optionalString(body, "capture_mode", { maxLength: 32 }) ?? "foreground";
      if (!CAPTURE_MODES.has(captureMode)) {
        throw new SosError(400, "invalid_capture_mode", "Unsupported capture mode");
      }

      const { data: lastRow } = await admin
        .from("sos_evidence")
        .select("sequence")
        .eq("sos_id", sosId)
        .eq("kind", kind)
        .order("sequence", { ascending: false })
        .limit(1)
        .maybeSingle();

      const sequence = (lastRow?.sequence ?? 0) + 1;
      const capturedAt =
        optionalString(body, "captured_at", { maxLength: 40 }) ?? new Date().toISOString();
      const extension = contentType.split("/")[1].replace("mpeg", "mp3").replace("heic", "heic");
      const folder = kind === "photo" ? "photos" : "audio";
      const fileName = `${String(sequence).padStart(3, "0")}-${Date.now()}.${extension}`;
      const storagePath = `${sosId}/${folder}/${fileName}`;

      const { data: signed, error: signedError } = await admin.storage
        .from(EVIDENCE_BUCKET)
        .createSignedUploadUrl(storagePath);

      if (signedError || !signed) {
        throw new SosError(502, "sign_upload_failed", "Unable to authorise the evidence upload");
      }

      const { data: row, error: insertError } = await admin
        .from("sos_evidence")
        .insert({
          sos_id: sosId,
          user_id: incident.user_id,
          kind,
          sequence,
          storage_path: storagePath,
          captured_at: capturedAt,
          latitude: optionalNumber(body, "latitude", { min: -90, max: 90 }),
          longitude: optionalNumber(body, "longitude", { min: -180, max: 180 }),
          accuracy: optionalNumber(body, "accuracy", { min: 0 }),
          capture_mode: captureMode,
          content_type: contentType,
          status: "PENDING",
        })
        .select("*")
        .single();

      if (insertError) {
        throw new SosError(502, "evidence_insert_failed", "Unable to record evidence metadata");
      }

      return jsonResponse({
        ok: true,
        evidence: row,
        storage_path: storagePath,
        signed_upload_url: signed.signedUrl,
        token: signed.token,
        upsert: false,
      });
    }

    // -----------------------------------------------------------------
    if (action === "record_result") {
      const evidenceId = requireString(body, "evidence_id", { maxLength: 64 });
      const outcome = requireString(body, "outcome", { maxLength: 24 }).toUpperCase();
      if (!["UPLOADED", "FAILED", "SKIPPED_UNAVAILABLE"].includes(outcome)) {
        throw new SosError(400, "invalid_outcome", "Unsupported evidence outcome");
      }

      const { data: existing } = await admin
        .from("sos_evidence")
        .select("id, sos_id")
        .eq("id", evidenceId)
        .maybeSingle();
      if (!existing || existing.sos_id !== sosId) {
        throw new SosError(404, "evidence_not_found", "Evidence record not found");
      }

      const { data: row, error } = await admin
        .from("sos_evidence")
        .update({
          status: outcome,
          byte_size: optionalNumber(body, "byte_size", { min: 0 }),
          error: optionalString(body, "error", { maxLength: 500 }),
        })
        .eq("id", evidenceId)
        .select("*")
        .single();

      if (error) throw new SosError(502, "evidence_update_failed", "Unable to update evidence status");

      // Roll up counters on the incident for the admin dashboard.
      const { data: agg } = await admin
        .from("sos_evidence")
        .select("kind, status")
        .eq("sos_id", sosId);

      const uploaded = (agg ?? []).filter((item) => item.status === "UPLOADED");
      await admin
        .from("sos_incidents")
        .update({
          evidence_photo_count: uploaded.filter((item) => item.kind === "photo").length,
          evidence_audio_count: uploaded.filter((item) => item.kind === "audio").length,
          evidence_last_cycle_at: new Date().toISOString(),
        })
        .eq("id", sosId);

      return jsonResponse({ ok: true, evidence: row });
    }

    // -----------------------------------------------------------------
    if (action === "list") {
      const { data, error } = await admin
        .from("sos_evidence")
        .select("*")
        .eq("sos_id", sosId)
        .order("kind", { ascending: true })
        .order("sequence", { ascending: true });

      if (error) throw new SosError(502, "evidence_list_failed", "Unable to list evidence");
      return jsonResponse({ ok: true, evidence: data ?? [] });
    }

    // -----------------------------------------------------------------
    if (action === "sign_download") {
      const { data: rows, error } = await admin
        .from("sos_evidence")
        .select("id, kind, sequence, storage_path, captured_at, capture_mode, status, byte_size, content_type, latitude, longitude, accuracy")
        .eq("sos_id", sosId)
        .eq("status", "UPLOADED")
        .order("sequence", { ascending: true });

      if (error) throw new SosError(502, "evidence_list_failed", "Unable to list evidence");

      const signedItems = await Promise.all(
        (rows ?? []).map(async (row) => {
          const { data: signed } = await admin.storage
            .from(EVIDENCE_BUCKET)
            .createSignedUrl(row.storage_path, 60 * 10, { download: row.kind === "audio" });
          return {
            ...row,
            signed_url: signed?.signedUrl ?? null,
          };
        }),
      );

      return jsonResponse({ ok: true, evidence: signedItems, expires_in_seconds: 600 });
    }

    throw new SosError(400, "unknown_action", `Unsupported action: ${sanitizeSegment(action)}`);
  } catch (error) {
    return errorResponse(error);
  }
});
