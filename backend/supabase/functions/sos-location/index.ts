// SOS location ingestion.
//
// Two callers are supported:
//   1. The running app (foreground)  -> apikey + Authorization + tracking token
//   2. The iOS/Android background task -> apikey + Authorization + tracking token
//
// The tracking token is an HMAC minted at activation time and bound to the
// incident + user + expiry. It is the reason a leaked anon key cannot be used to
// inject fake location data into somebody else's emergency incident.
//
// Pings are rejected once the incident is no longer ACTIVE, which is what makes
// "stop tracking when SOS ends" enforceable server-side rather than only in UI.

import {
  SosError,
  errorResponse,
  jsonResponse,
  optionalNumber,
  optionsResponse,
  readJsonBody,
  requireClientAuthorization,
  requireUserId,
  supabaseAdmin,
  verifyTrackingToken,
} from "../_shared/sos.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    requireClientAuthorization(req);
    const body = await readJsonBody(req);
    const admin = supabaseAdmin();

    const userId = requireUserId(body);
    const sosId =
      typeof body.sos_id === "string" && body.sos_id.trim() ? body.sos_id.trim() : null;
    if (!sosId) throw new SosError(400, "sos_id_required", "sos_id is required");

    const token = typeof body.tracking_token === "string" ? body.tracking_token : "";
    const tokenValid = await verifyTrackingToken(token, sosId, userId);
    if (!tokenValid) {
      throw new SosError(
        401,
        "invalid_tracking_token",
        "Location update rejected: the SOS tracking token is invalid or expired.",
      );
    }

    const { data: incident, error: incidentError } = await admin
      .from("sos_incidents")
      .select("id, user_id, status, location_ping_count")
      .eq("id", sosId)
      .maybeSingle();

    if (incidentError) throw new SosError(502, "incident_lookup_failed", "Unable to read the SOS incident");
    if (!incident) throw new SosError(404, "incident_not_found", "SOS incident not found");
    if (incident.user_id !== userId) {
      throw new SosError(403, "not_incident_owner", "This SOS incident belongs to another user");
    }
    if (incident.status !== "ACTIVE") {
      // The incident has ended: refuse further tracking, permanently.
      throw new SosError(
        409,
        "incident_not_active",
        `This SOS incident is ${incident.status}; location tracking has stopped.`,
      );
    }

    const latitude = optionalNumber(body, "latitude", { min: -90, max: 90 });
    const longitude = optionalNumber(body, "longitude", { min: -180, max: 180 });
    if (latitude == null || longitude == null) {
      throw new SosError(400, "coordinates_required", "latitude and longitude are required");
    }

    const sourceRaw = typeof body.source === "string" ? body.source : "foreground";
    const source = sourceRaw === "background" ? "background" : sourceRaw === "manual" ? "manual" : "foreground";

    const recordedAt =
      typeof body.recorded_at === "string" && !Number.isNaN(Date.parse(body.recorded_at))
        ? body.recorded_at
        : new Date().toISOString();

    // Next sequence number, computed server-side so background and foreground
    // writers can never collide on the (sos_id, sequence) unique index.
    const nextSequence = (incident.location_ping_count ?? 0) + 1;

    const { error: insertError } = await admin.from("sos_locations").insert({
      sos_id: incident.id,
      user_id: userId,
      sequence: nextSequence,
      latitude,
      longitude,
      accuracy: optionalNumber(body, "accuracy", { min: 0 }),
      altitude: optionalNumber(body, "altitude"),
      speed: optionalNumber(body, "speed", { min: 0 }),
      heading: optionalNumber(body, "heading", { min: 0, max: 360 }),
      source,
      recorded_at: recordedAt,
    });

    if (insertError) {
      // A duplicate sequence means a concurrent writer won; retry once.
      if (insertError.code === "23505") {
        const retrySequence = nextSequence + 1;
        const { error: retryError } = await admin.from("sos_locations").insert({
          sos_id: incident.id,
          user_id: userId,
          sequence: retrySequence,
          latitude,
          longitude,
          accuracy: optionalNumber(body, "accuracy", { min: 0 }),
          altitude: optionalNumber(body, "altitude"),
          speed: optionalNumber(body, "speed", { min: 0 }),
          heading: optionalNumber(body, "heading", { min: 0, max: 360 }),
          source,
          recorded_at: recordedAt,
        });
        if (retryError) {
          throw new SosError(502, "location_insert_failed", "Unable to record the location update");
        }
      } else {
        throw new SosError(502, "location_insert_failed", "Unable to record the location update");
      }
    }

    const { data: updated, error: updateError } = await admin
      .from("sos_incidents")
      .update({
        last_latitude: latitude,
        last_longitude: longitude,
        last_accuracy: optionalNumber(body, "accuracy", { min: 0 }),
        last_location_at: recordedAt,
        last_location_source: source,
        location_ping_count: (incident.location_ping_count ?? 0) + 1,
      })
      .eq("id", incident.id)
      .eq("status", "ACTIVE")
      .select("id, location_ping_count, last_location_at")
      .maybeSingle();

    if (updateError) {
      throw new SosError(502, "incident_update_failed", "Unable to update the SOS incident");
    }

    return jsonResponse({
      ok: true,
      sequence: updated?.location_ping_count ?? nextSequence,
      last_location_at: updated?.last_location_at ?? recordedAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
