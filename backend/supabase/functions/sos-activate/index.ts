// SOS activation.
//
// Creates the incident, snapshots the user's emergency contacts, records the
// dispatch attempt for every contact, mints the background tracking token, and
// returns everything the app needs to start location sharing.
//
// Activation is idempotent: if the user already has an ACTIVE incident, that
// incident is returned instead of failing, so a double tap can never create two
// concurrent emergencies.

import {
  SosError,
  buildMapsUrl,
  buildReferenceCode,
  errorResponse,
  jsonResponse,
  mintTrackingToken,
  normalizePhone,
  optionalString,
  optionsResponse,
  readJsonBody,
  requireClientAuthorization,
  requireCoordinates,
  requireUserId,
  supabaseAdmin,
} from "../_shared/sos.ts";
import { buildAlertMessage, describeDispatcher, dispatchContactAlert } from "../_shared/dispatch.ts";

type ContactRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  verified: boolean;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    requireClientAuthorization(req);
    const body = await readJsonBody(req);
    const admin = supabaseAdmin();

    const userId = requireUserId(body);

    // -------------------------------------------------------------------
    // Cold-start resume: report the caller's current incident without
    // creating one. The app calls this on launch to restore the SOS banner
    // after a process restart, so the UI never shows a stale ACTIVE state.
    // -------------------------------------------------------------------
    if (body.action === "status") {
      const { data: current } = await admin
        .from("sos_incidents")
        .select("*")
        .eq("user_id", userId)
        .in("status", ["ACTIVE", "RESOLVED", "CANCELLED"])
        .order("activated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!current) {
        return jsonResponse({ incident: null, tracking_token: null });
      }

      const [{ data: contacts }, { data: alerts }] = await Promise.all([
        admin
          .from("emergency_contacts")
          .select("id, name, phone, email, is_primary, verified")
          .eq("user_id", userId)
          .order("is_primary", { ascending: false }),
        admin
          .from("sos_contact_alerts")
          .select("contact_id, contact_name, contact_phone, contact_email, channel, status")
          .eq("sos_id", current.id)
          .eq("phase", "activation"),
      ]);

      // A tracking token is only re-minted for a still-active incident.
      const token = current.status === "ACTIVE" ? await mintTrackingToken(current.id, userId) : null;

      return jsonResponse({
        incident: current,
        tracking_token: token,
        contacts: contacts ?? [],
        dispatch: alerts ?? [],
        dispatch_status: describeDispatcher(),
        maps_url: buildMapsUrl(current.last_latitude, current.last_longitude),
        already_active: current.status === "ACTIVE",
      });
    }

    const activationSource = optionalString(body, "activation_source", { maxLength: 32 }) ?? "app";
    const capabilities =
      body.evidence_capabilities && typeof body.evidence_capabilities === "object"
        ? (body.evidence_capabilities as Record<string, unknown>)
        : {};

    const { latitude, longitude, accuracy } = requireCoordinates(body);

    // ---------------------------------------------------------------
    // 0. Idempotency: an already-active incident wins.
    // ---------------------------------------------------------------
    const { data: existing } = await admin
      .from("sos_incidents")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (existing) {
      const token = await mintTrackingToken(existing.id, userId);
      return jsonResponse({
        incident: existing,
        tracking_token: token,
        contacts: [],
        dispatch: [],
        dispatch_status: describeDispatcher(),
        already_active: true,
      });
    }

    // ---------------------------------------------------------------
    // 1. Resolve the current ride.
    // ---------------------------------------------------------------
    let rideId: string | null = optionalString(body, "current_ride_id", { maxLength: 64 });
    if (rideId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rideId)) {
      rideId = null;
    }

    if (!rideId) {
      const { data: fallbackRideId } = await admin.rpc("find_user_current_ride", {
        p_user_id: userId,
      });
      rideId = typeof fallbackRideId === "string" ? fallbackRideId : null;
    }

    let ridePickup: string | null = null;
    let rideDropoff: string | null = null;
    if (rideId) {
      const { data: ride } = await admin
        .from("rides")
        .select("id, pickup_address, dropoff_address, travel_time")
        .eq("id", rideId)
        .maybeSingle();
      if (ride) {
        ridePickup = ride.pickup_address ?? null;
        rideDropoff = ride.dropoff_address ?? null;
      } else {
        rideId = null;
      }
    }

    // ---------------------------------------------------------------
    // 2. Load the profile and emergency contacts.
    // ---------------------------------------------------------------
    const [{ data: profile }, { data: contactRows, error: contactError }] = await Promise.all([
      admin.from("user_profiles").select("id, name, phone_number").eq("id", userId).maybeSingle(),
      admin
        .from("emergency_contacts")
        .select("id, name, phone, email, is_primary, verified")
        .eq("user_id", userId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true }),
    ]);

    if (contactError) {
      throw new SosError(502, "contacts_unavailable", "Unable to load emergency contacts");
    }

    const contacts = (contactRows ?? []) as ContactRow[];
    const userName = profile?.name?.trim() || "A LinQ rider";
    const mapsUrl = buildMapsUrl(latitude, longitude);
    const activatedAt = new Date().toISOString();

    // ---------------------------------------------------------------
    // 3. Create the incident.
    // ---------------------------------------------------------------
    const referenceCode = buildReferenceCode();
    const { data: incident, error: incidentError } = await admin
      .from("sos_incidents")
      .insert({
        reference_code: referenceCode,
        user_id: userId,
        current_ride_id: rideId,
        status: "ACTIVE",
        activation_source: activationSource,
        latitude,
        longitude,
        accuracy,
        last_latitude: latitude,
        last_longitude: longitude,
        last_accuracy: accuracy,
        last_location_at: activatedAt,
        last_location_source: "foreground",
        location_ping_count: 1,
        evidence_capabilities: capabilities,
        contacts_total: contacts.length,
        contacts_notified: 0,
        activated_at: activatedAt,
      })
      .select("*")
      .single();

    if (incidentError || !incident) {
      // A concurrent activation may have won the unique index race.
      const { data: raced } = await admin
        .from("sos_incidents")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "ACTIVE")
        .maybeSingle();
      if (raced) {
        const token = await mintTrackingToken(raced.id, userId);
        return jsonResponse({
          incident: raced,
          tracking_token: token,
          contacts: [],
          dispatch: [],
          dispatch_status: describeDispatcher(),
          already_active: true,
        });
      }
      throw new SosError(502, "incident_create_failed", "Unable to create the SOS incident");
    }

    // ---------------------------------------------------------------
    // 4. Record the initial location ping (sequence 0).
    // ---------------------------------------------------------------
    await admin.from("sos_locations").insert({
      sos_id: incident.id,
      user_id: userId,
      sequence: 0,
      latitude: latitude as number,
      longitude: longitude as number,
      accuracy,
      source: "manual",
      recorded_at: activatedAt,
    });

    // ---------------------------------------------------------------
    // 5. Dispatch alerts to every emergency contact.
    // ---------------------------------------------------------------
    const message = buildAlertMessage({
      user_name: userName,
      reference_code: incident.reference_code,
      maps_url: mapsUrl,
      ride_pickup: ridePickup,
      ride_dropoff: rideDropoff,
      activated_at: activatedAt,
    });

    const dispatchResults = [] as Array<{
      contact_id: string;
      contact_name: string;
      channel: string;
      status: string;
    }>;
    let notified = 0;

    for (const contact of contacts) {
      const phone = normalizePhone(contact.phone);
      const channel: "sms" | "email" = phone ? "sms" : "email";
      const target = channel === "sms" ? phone : contact.email;

      const result = await dispatchContactAlert({
        sos_id: incident.id,
        reference_code: incident.reference_code,
        user_id: userId,
        user_name: userName,
        user_phone: normalizePhone(profile?.phone_number ?? null),
        contact_name: contact.name,
        contact_phone: phone,
        contact_email: contact.email,
        channel,
        message,
        maps_url: mapsUrl,
        latitude,
        longitude,
        accuracy,
        activated_at: activatedAt,
        current_ride_id: rideId,
        ride_pickup: ridePickup,
        ride_dropoff: rideDropoff,
      });

      if (result.status === "SENT") notified += 1;

      await admin.from("sos_contact_alerts").insert({
        sos_id: incident.id,
        user_id: userId,
        contact_id: contact.id,
        contact_name: contact.name,
        contact_phone: phone,
        contact_email: contact.email,
        channel,
        status: result.status,
        provider: result.provider,
        provider_message_id: result.provider_message_id,
        provider_error: result.provider_error,
        maps_url: mapsUrl,
        payload: {
          message,
          contact_verified: contact.verified,
          is_primary: contact.is_primary,
        },
        attempted_at: activatedAt,
        sent_at: result.status === "SENT" ? new Date().toISOString() : null,
      });

      dispatchResults.push({
        contact_id: contact.id,
        contact_name: contact.name,
        channel: target ? channel : channel,
        status: result.status,
      });
    }

    // Keep the incident's contact counters in step with reality.
    const { data: updatedIncident } = await admin
      .from("sos_incidents")
      .update({ contacts_notified: notified, contacts_total: contacts.length })
      .eq("id", incident.id)
      .select("*")
      .single();

    const trackingToken = await mintTrackingToken(incident.id, userId);

    return jsonResponse({
      incident: updatedIncident ?? incident,
      tracking_token: trackingToken,
      contacts: contacts.map((contact) => ({
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        is_primary: contact.is_primary,
        verified: contact.verified,
      })),
      dispatch: dispatchResults,
      dispatch_status: describeDispatcher(),
      maps_url: mapsUrl,
      already_active: false,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
