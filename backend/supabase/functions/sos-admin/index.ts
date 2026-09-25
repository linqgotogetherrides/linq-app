// LinQ SOS admin / safety-team API.
//
// Gated on user_profiles.app_role IN ('admin','safety_team'). Every request is
// re-checked server-side; hiding the dashboard route in the app is a UX
// affordance, not the security boundary.
//
// Returns exactly the fields the operations dashboard needs:
//   user, phone, current ride, pickup, drop, current location,
//   SOS activation time, last location update, emergency contacts, status

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
import { describeDispatcher } from "../_shared/dispatch.ts";

async function assertOperator(admin: ReturnType<typeof supabaseAdmin>, actorId: string) {
  const { data, error } = await admin.rpc("is_sos_operator", { p_user_id: actorId });
  if (error) throw new SosError(502, "role_check_failed", "Unable to verify operator role");
  if (!data) {
    throw new SosError(403, "not_operator", "This account is not a LinQ safety operator");
  }
}

function pick<T extends Record<string, unknown>>(row: T, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) result[key] = row[key];
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    requireClientAuthorization(req);
    const body = await readJsonBody(req);
    const admin = supabaseAdmin();

    const actorId = requireUserId(body, "actor_id");
    await assertOperator(admin, actorId);

    const action = requireString(body, "action", { maxLength: 24 });

    // -----------------------------------------------------------------
    if (action === "incidents") {
      const statusFilter = optionalString(body, "status", { maxLength: 16 })?.toUpperCase() ?? null;
      const limit = Math.min(Number(body.limit ?? 50) || 50, 200);

      let query = admin
        .from("sos_incidents")
        .select(
          `*,
           profile:user_profiles!sos_incidents_user_id_fkey (id, name, phone_number, avatar_url),
           ride:rides!sos_incidents_current_ride_id_fkey (id, pickup_address, dropoff_address, travel_time, ride_type, status)`,
          { count: "exact" },
        )
        .order("activated_at", { ascending: false })
        .limit(limit);

      if (statusFilter && statusFilter !== "ALL") {
        query = query.eq("status", statusFilter);
      }

      const { data, error, count } = await query;
      if (error) throw new SosError(502, "incidents_query_failed", "Unable to load SOS incidents");

      const incidents = (data ?? []).map((row) => {
        const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
        const ride = Array.isArray(row.ride) ? row.ride[0] : row.ride;
        return {
          id: row.id,
          reference_code: row.reference_code,
          status: row.status,
          user_id: row.user_id,
          user_name: profile?.name ?? "Unknown rider",
          user_phone: profile?.phone_number ?? null,
          user_avatar_url: profile?.avatar_url ?? null,
          current_ride_id: row.current_ride_id,
          ride_pickup: ride?.pickup_address ?? null,
          ride_dropoff: ride?.dropoff_address ?? null,
          ride_travel_time: ride?.travel_time ?? null,
          ride_status: ride?.status ?? null,
          latitude: row.last_latitude,
          longitude: row.last_longitude,
          accuracy: row.last_accuracy,
          maps_url: buildMapsUrl(row.last_latitude, row.last_longitude),
          activated_at: row.activated_at,
          last_location_at: row.last_location_at,
          location_ping_count: row.location_ping_count,
          contacts_total: row.contacts_total,
          contacts_notified: row.contacts_notified,
          evidence_photo_count: row.evidence_photo_count,
          evidence_audio_count: row.evidence_audio_count,
          evidence_capabilities: row.evidence_capabilities,
          activation_source: row.activation_source,
          acknowledged_at: row.acknowledged_at,
          acknowledged_by: row.acknowledged_by,
          ended_at: row.ended_at,
          end_reason: row.end_reason,
        };
      });

      return jsonResponse({ ok: true, incidents, total: count ?? incidents.length });
    }

    // -----------------------------------------------------------------
    if (action === "detail") {
      const sosId = requireString(body, "sos_id", { maxLength: 64 });

      const { data: incident, error } = await admin
        .from("sos_incidents")
        .select(
          `*,
           profile:user_profiles!sos_incidents_user_id_fkey (id, name, phone_number, email, avatar_url, emergency_contact),
           ride:rides!sos_incidents_current_ride_id_fkey (id, pickup_address, dropoff_address, travel_time, ride_type, status)`,
        )
        .eq("id", sosId)
        .maybeSingle();

      if (error) throw new SosError(502, "incident_query_failed", "Unable to load the SOS incident");
      if (!incident) throw new SosError(404, "incident_not_found", "SOS incident not found");

      const [locations, evidence, alerts, contacts] = await Promise.all([
        admin
          .from("sos_locations")
          .select("*")
          .eq("sos_id", sosId)
          .order("sequence", { ascending: true })
          .limit(1000),
        admin
          .from("sos_evidence")
          .select("*")
          .eq("sos_id", sosId)
          .order("kind", { ascending: true })
          .order("sequence", { ascending: true }),
        admin
          .from("sos_contact_alerts")
          .select("*")
          .eq("sos_id", sosId)
          .order("attempted_at", { ascending: false }),
        admin
          .from("emergency_contacts")
          .select("*")
          .eq("user_id", incident.user_id)
          .order("is_primary", { ascending: false }),
      ]);

      const profile = Array.isArray(incident.profile) ? incident.profile[0] : incident.profile;
      const ride = Array.isArray(incident.ride) ? incident.ride[0] : incident.ride;

      return jsonResponse({
        ok: true,
        incident: {
          ...pick(incident, [
            "id",
            "reference_code",
            "status",
            "user_id",
            "current_ride_id",
            "activation_source",
            "latitude",
            "longitude",
            "accuracy",
            "last_latitude",
            "last_longitude",
            "last_accuracy",
            "last_location_at",
            "last_location_source",
            "location_ping_count",
            "evidence_capabilities",
            "evidence_photo_count",
            "evidence_audio_count",
            "evidence_last_cycle_at",
            "contacts_total",
            "contacts_notified",
            "activated_at",
            "ended_at",
            "end_reason",
            "ended_by",
            "acknowledged_at",
            "acknowledged_by",
          ]),
          user: profile ?? null,
          ride: ride ?? null,
          maps_url: buildMapsUrl(incident.last_latitude, incident.last_longitude),
        },
        locations: locations.data ?? [],
        evidence: evidence.data ?? [],
        alerts: alerts.data ?? [],
        contacts: contacts.data ?? [],
        dispatch_status: describeDispatcher(),
      });
    }

    // -----------------------------------------------------------------
    if (action === "acknowledge") {
      const sosId = requireString(body, "sos_id", { maxLength: 64 });
      const { data, error } = await admin
        .from("sos_incidents")
        .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: actorId })
        .eq("id", sosId)
        .select("id, acknowledged_at, acknowledged_by")
        .single();
      if (error) throw new SosError(502, "acknowledge_failed", "Unable to acknowledge the incident");
      return jsonResponse({ ok: true, incident: data });
    }

    // -----------------------------------------------------------------
    if (action === "stats") {
      const [{ count: active }, { count: resolved }, { count: cancelled }] = await Promise.all([
        admin.from("sos_incidents").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
        admin.from("sos_incidents").select("id", { count: "exact", head: true }).eq("status", "RESOLVED"),
        admin.from("sos_incidents").select("id", { count: "exact", head: true }).eq("status", "CANCELLED"),
      ]);
      return jsonResponse({
        ok: true,
        active: active ?? 0,
        resolved: resolved ?? 0,
        cancelled: cancelled ?? 0,
        dispatch_status: describeDispatcher(),
      });
    }

    throw new SosError(400, "unknown_action", `Unsupported action: ${action}`);
  } catch (error) {
    return errorResponse(error);
  }
});
