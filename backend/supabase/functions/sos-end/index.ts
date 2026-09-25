// SOS termination.
//
// Ends the incident (RESOLVED or CANCELLED), stops all further location pings
// server-side, and notifies emergency contacts that the emergency is over so
// they are not left worrying.
//
// Once this returns, sos-location rejects further pings for this incident with
// HTTP 409, so the tracking loop is genuinely stopped rather than merely hidden.

import {
  SosError,
  buildMapsUrl,
  errorResponse,
  jsonResponse,
  optionalString,
  optionsResponse,
  readJsonBody,
  requireClientAuthorization,
  requireString,
  requireUserId,
  supabaseAdmin,
} from "../_shared/sos.ts";
import { dispatchContactAlert } from "../_shared/dispatch.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    requireClientAuthorization(req);
    const body = await readJsonBody(req);
    const admin = supabaseAdmin();

    const actorId = requireUserId(body, "actor_id");
    const sosId = requireString(body, "sos_id", { maxLength: 64 });
    const status = requireString(body, "status", { maxLength: 16 }).toUpperCase();

    if (status !== "RESOLVED" && status !== "CANCELLED") {
      throw new SosError(400, "invalid_status", "status must be RESOLVED or CANCELLED");
    }
    const reason = optionalString(body, "end_reason", { maxLength: 280 });

    const { data: incident, error: lookupError } = await admin
      .from("sos_incidents")
      .select("*")
      .eq("id", sosId)
      .maybeSingle();

    if (lookupError) throw new SosError(502, "incident_lookup_failed", "Unable to read the SOS incident");
    if (!incident) throw new SosError(404, "incident_not_found", "SOS incident not found");

    const isOwner = incident.user_id === actorId;
    if (!isOwner) {
      // Non-owners must be safety operators.
      const { data: operator } = await admin.rpc("is_sos_operator", { p_user_id: actorId });
      if (!operator) {
        throw new SosError(403, "not_permitted", "Only the incident owner or a LinQ safety operator can end this SOS");
      }
    }

    if (incident.status !== "ACTIVE") {
      // Idempotent: ending an already-ended incident is not an error.
      return jsonResponse({ ok: true, incident, already_ended: true });
    }

    const endedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await admin
      .from("sos_incidents")
      .update({
        status,
        ended_at: endedAt,
        end_reason: reason,
        ended_by: actorId,
      })
      .eq("id", incident.id)
      .eq("status", "ACTIVE")
      .select("*")
      .single();

    if (updateError || !updated) {
      throw new SosError(502, "incident_end_failed", "Unable to end the SOS incident");
    }

    // ---------------------------------------------------------------
    // Tell the emergency contacts the incident is over.
    // ---------------------------------------------------------------
    const { data: profile } = await admin
      .from("user_profiles")
      .select("name, phone_number")
      .eq("id", incident.user_id)
      .maybeSingle();

    const { data: priorAlerts } = await admin
      .from("sos_contact_alerts")
      .select("contact_id, contact_name, contact_phone, contact_email, channel")
      .eq("sos_id", incident.id);

    const userName = profile?.name?.trim() || "A LinQ rider";
    const mapsUrl = buildMapsUrl(incident.last_latitude, incident.last_longitude);
    const resolutionNote = reason || (status === "CANCELLED" ? "The user cancelled the SOS." : "The emergency is over.");

    for (const alert of priorAlerts ?? []) {
      const result = await dispatchContactAlert({
        sos_id: incident.id,
        reference_code: incident.reference_code,
        user_id: incident.user_id,
        user_name: userName,
        user_phone: profile?.phone_number ?? null,
        contact_name: alert.contact_name,
        contact_phone: alert.contact_phone,
        contact_email: alert.contact_email,
        channel: (alert.channel === "email" ? "email" : "sms") as "sms" | "email",
        message: [
          `LINQ SOS UPDATE`,
          ``,
          `The SOS emergency (${incident.reference_code}) raised by ${userName} is now ${status.toLowerCase()}.`,
          `Ended: ${endedAt}`,
          `Note: ${resolutionNote}`,
          `Last known location: ${mapsUrl ?? "unavailable"}`,
          ``,
          `Live location sharing for this incident has stopped.`,
        ].join("\n"),
        maps_url: mapsUrl,
        latitude: incident.last_latitude,
        longitude: incident.last_longitude,
        accuracy: incident.last_accuracy,
        activated_at: incident.activated_at,
        current_ride_id: incident.current_ride_id,
        ride_pickup: null,
        ride_dropoff: null,
      });

      await admin.from("sos_contact_alerts").insert({
        sos_id: incident.id,
        user_id: incident.user_id,
        contact_id: alert.contact_id,
        contact_name: alert.contact_name,
        contact_phone: alert.contact_phone,
        contact_email: alert.contact_email,
        channel: alert.channel,
        status: result.status,
        provider: result.provider,
        provider_message_id: result.provider_message_id,
        provider_error: result.provider_error,
        maps_url: mapsUrl,
        phase: "resolution",
        payload: { phase: "resolution", note: resolutionNote },
        attempted_at: endedAt,
        sent_at: result.status === "SENT" ? new Date().toISOString() : null,
      });
    }

    return jsonResponse({ ok: true, incident: updated, already_ended: false });
  } catch (error) {
    return errorResponse(error);
  }
});
