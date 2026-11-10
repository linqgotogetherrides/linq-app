import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import * as polyline from "https://esm.sh/@mapbox/polyline@1.2.1";
import * as turf from "https://esm.sh/@turf/turf@6.5.0";

// Configuration thresholds
const MAX_DETOUR_KM = 6.0;
const MAX_DETOUR_PERCENT = 35; // Maximum % increase in driver's route
const MAX_PICKUP_DEVIATION_KM = 4.0;
const MAX_DROP_DEVIATION_KM = 4.0;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function parseTimeToMinutes(timeStr?: string): number | null {
  if (!timeStr) return null;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const suffix = match[3]?.toUpperCase();
  if (suffix === "PM" && hour < 12) hour += 12;
  if (suffix === "AM" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      },
    );

    const body = await req.json();
    const {
      pickup,
      dropoff,
      travelTime,
      travelDate,
      selectedDays,
      seatsNeeded = 1,
      womenOnly = false,
      excludeUserId,
    } = body;

    if (!pickup || !dropoff) {
      return new Response(
        JSON.stringify({ error: "pickup and dropoff coordinates are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 1: Try the intelligent PostGIS pooling RPC first
    const { data: dbMatches, error: rpcError } = await supabaseClient.rpc(
      "find_pooling_matches",
      {
        p_pickup_lon: pickup.lng ?? pickup.longitude,
        p_pickup_lat: pickup.lat ?? pickup.latitude,
        p_dropoff_lon: dropoff.lng ?? dropoff.longitude,
        p_dropoff_lat: dropoff.lat ?? dropoff.latitude,
        p_travel_time: travelTime ?? null,
        p_travel_date: travelDate ?? null,
        p_selected_days: selectedDays ?? null,
        p_seats_needed: seatsNeeded,
        p_women_only: Boolean(womenOnly),
        p_max_deviation_meters: Math.max(MAX_PICKUP_DEVIATION_KM, MAX_DROP_DEVIATION_KM) * 1000,
        p_exclude_user_id: excludeUserId ?? null,
      },
    );

    if (!rpcError && Array.isArray(dbMatches) && dbMatches.length > 0) {
      return new Response(
        JSON.stringify({ matches: dbMatches, source: "postgis_engine" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fallback: If find_pooling_matches returned no rows or is deploying, use find_candidate_rides + Turf
    const { data: candidates, error: dbError } = await supabaseClient.rpc(
      "find_candidate_rides",
      {
        passenger_pickup_lon: pickup.lng ?? pickup.longitude,
        passenger_pickup_lat: pickup.lat ?? pickup.latitude,
        passenger_dropoff_lon: dropoff.lng ?? dropoff.longitude,
        passenger_dropoff_lat: dropoff.lat ?? dropoff.latitude,
        max_deviation_meters: Math.max(MAX_PICKUP_DEVIATION_KM, MAX_DROP_DEVIATION_KM) * 1000,
      },
    );

    if (dbError) throw dbError;

    if (!candidates || candidates.length === 0) {
      return new Response(JSON.stringify({ matches: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const passengerPickupPoint = turf.point([pickup.lng ?? pickup.longitude, pickup.lat ?? pickup.latitude]);
    const passengerDropoffPoint = turf.point([dropoff.lng ?? dropoff.longitude, dropoff.lat ?? dropoff.latitude]);
    const requestedMinutes = parseTimeToMinutes(travelTime);

    const matches = [];

    for (const ride of candidates) {
      if (excludeUserId && ride.user_id === excludeUserId) continue;
      if (ride.available_seats < seatsNeeded) continue;
      if (womenOnly && !ride.women_only) continue;

      let score = 100;
      let sharedSegmentKm = 0;
      let pickupDeviationKm = 0;
      let dropoffDeviationKm = 0;
      let detourKm = 0;

      if (ride.route_polyline) {
        try {
          const coordinates = polyline.decode(ride.route_polyline).map((coord: number[]) => [coord[1], coord[0]]);
          const driverLine = turf.lineString(coordinates);

          const snappedPickup = turf.nearestPointOnLine(driverLine, passengerPickupPoint);
          const snappedDropoff = turf.nearestPointOnLine(driverLine, passengerDropoffPoint);

          const pickupAlongRoute = snappedPickup.properties?.location;
          const dropoffAlongRoute = snappedDropoff.properties?.location;

          if (
            typeof pickupAlongRoute !== "number" ||
            typeof dropoffAlongRoute !== "number" ||
            pickupAlongRoute >= dropoffAlongRoute
          ) {
            continue; // Opposite direction or invalid
          }

          pickupDeviationKm = turf.distance(passengerPickupPoint, snappedPickup);
          dropoffDeviationKm = turf.distance(passengerDropoffPoint, snappedDropoff);

          if (pickupDeviationKm > MAX_PICKUP_DEVIATION_KM || dropoffDeviationKm > MAX_DROP_DEVIATION_KM) {
            continue;
          }

          sharedSegmentKm = Math.abs(dropoffAlongRoute - pickupAlongRoute);
          detourKm = pickupDeviationKm + dropoffDeviationKm;

          const originalDriverKm = turf.length(driverLine);
          if (originalDriverKm > 0) {
            const detourPercent = (detourKm / originalDriverKm) * 100;
            if (detourKm > MAX_DETOUR_KM || detourPercent > MAX_DETOUR_PERCENT) {
              continue;
            }
          }

          // Penalty for detour
          score -= (detourKm / MAX_DETOUR_KM) * 25;
          // Bonus for shared corridor
          if (originalDriverKm > 0) {
            score += Math.min((sharedSegmentKm / originalDriverKm) * 20, 20);
          }
        } catch {
          // Continue with proximity scoring if polyline decode fails
        }
      }

      // Time difference penalty
      if (requestedMinutes !== null && ride.travel_time) {
        const rideMinutes = parseTimeToMinutes(ride.travel_time);
        if (rideMinutes !== null) {
          const diff = Math.min(
            Math.abs(requestedMinutes - rideMinutes),
            1440 - Math.abs(requestedMinutes - rideMinutes),
          );
          if (diff <= 15) score += 5;
          else if (diff <= 30) score -= 5;
          else if (diff <= 60) score -= 15;
          else score -= 30;
        }
      }

      score = Math.max(10, Math.min(100, Math.round(score)));

      let matchType = "other";
      if (score >= 80) matchType = "exact";
      else if (score >= 50) matchType = "nearby";

      matches.push({
        ...ride,
        matchScore: score,
        matchType,
        sharedDistanceKm: sharedSegmentKm.toFixed(2),
        detourDistanceKm: detourKm.toFixed(2),
        pickupDistanceKm: pickupDeviationKm.toFixed(2),
        dropoffDistanceKm: dropoffDeviationKm.toFixed(2),
        matchExplanation: score >= 80
          ? "High match • Shared route corridor"
          : "Shares part of your journey along this route",
      });
    }

    matches.sort((a, b) => b.matchScore - a.matchScore);

    return new Response(JSON.stringify({ matches, source: "turf_engine" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
