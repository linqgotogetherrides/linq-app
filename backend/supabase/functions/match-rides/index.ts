import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import * as polyline from "@mapbox/polyline";
import * as turf from "@turf/turf";

// Configuration thresholds
const MAX_DETOUR_KM = 5.0;
const MAX_DETOUR_PERCENT = 30; // Maximum % increase in driver's route
const MAX_PICKUP_DEVIATION_KM = 3.0;
const MAX_DROP_DEVIATION_KM = 3.0;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS
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

    const { pickup, dropoff } = await req.json();

    if (!pickup || !dropoff) {
      return new Response(
        JSON.stringify({
          error: "pickup and dropoff coordinates are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Step 1: Fast Candidate Retrieval (using the RPC)
    const { data: candidates, error: dbError } = await supabaseClient.rpc(
      "find_candidate_rides",
      {
        passenger_pickup_lon: pickup.lng,
        passenger_pickup_lat: pickup.lat,
        passenger_dropoff_lon: dropoff.lng,
        passenger_dropoff_lat: dropoff.lat,
        max_deviation_meters:
          Math.max(MAX_PICKUP_DEVIATION_KM, MAX_DROP_DEVIATION_KM) * 1000,
      },
    );

    if (dbError) throw dbError;

    if (!candidates || candidates.length === 0) {
      return new Response(JSON.stringify({ matches: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const passengerPickupPoint = turf.point([pickup.lng, pickup.lat]);
    const passengerDropoffPoint = turf.point([dropoff.lng, dropoff.lat]);

    const matches = [];

    // Step 2 & 3: Route Projection and Detour Analysis
    for (const ride of candidates) {
      if (!ride.route_polyline) continue; // Skip rides without a valid route

      // Decode polyline (polyline returns [lat, lng], Turf needs [lng, lat])
      const coordinates = polyline.decode(ride.route_polyline).map((
        coord: number[],
      ) => [coord[1], coord[0]]);
      const driverLine = turf.lineString(coordinates);

      // Project pickup and dropoff onto the driver's route
      const snappedPickup = turf.nearestPointOnLine(
        driverLine,
        passengerPickupPoint,
      );
      const snappedDropoff = turf.nearestPointOnLine(
        driverLine,
        passengerDropoffPoint,
      );

      // Calculate distance along the line from the start
      const pickupLocation = snappedPickup.properties?.location;
      const dropoffLocation = snappedDropoff.properties?.location;
      if (
        typeof pickupLocation !== "number" ||
        typeof dropoffLocation !== "number"
      ) {
        continue;
      }
      const pickupAlongRoute = pickupLocation;
      const dropoffAlongRoute = dropoffLocation;

      // Direction Validation: Passenger must want to go in the same direction as the driver
      if (pickupAlongRoute >= dropoffAlongRoute) {
        continue; // Wrong direction
      }

      // Calculate deviation distances
      const pickupDeviationKm = turf.distance(
        passengerPickupPoint,
        snappedPickup,
      );
      const dropoffDeviationKm = turf.distance(
        passengerDropoffPoint,
        snappedDropoff,
      );

      if (
        pickupDeviationKm > MAX_PICKUP_DEVIATION_KM ||
        dropoffDeviationKm > MAX_DROP_DEVIATION_KM
      ) {
        continue;
      }

      // Detour Analysis
      const sharedSegmentKm = Math.abs(dropoffAlongRoute - pickupAlongRoute);

      // Heuristic Detour: Direct distance from Driver route to Passenger Pickup + Passenger Dropoff back to Route
      const detourKm = pickupDeviationKm + dropoffDeviationKm;

      // Calculate original total driver route length
      const originalDriverKm = turf.length(driverLine);
      if (originalDriverKm <= 0) continue;
      const detourPercent = (detourKm / originalDriverKm) * 100;

      if (detourKm > MAX_DETOUR_KM || detourPercent > MAX_DETOUR_PERCENT) {
        continue;
      }

      // Step 4: Scoring
      // Start with 100
      let score = 100;

      // Penalty for detour
      score -= (detourKm / MAX_DETOUR_KM) * 20;

      // Bonus for large shared segment
      score += Math.min((sharedSegmentKm / originalDriverKm) * 20, 20);

      score = Math.max(0, Math.min(100, Math.round(score)));

      let matchType = "other";
      if (score > 85) matchType = "exact";
      else if (score > 50) matchType = "nearby";

      matches.push({
        ...ride,
        matchScore: score,
        matchType,
        _debug: {
          routeOverlapKm: sharedSegmentKm.toFixed(2),
          pickupDeviationKm: pickupDeviationKm.toFixed(2),
          dropoffDeviationKm: dropoffDeviationKm.toFixed(2),
          detourKm: detourKm.toFixed(2),
          detourPercent: detourPercent.toFixed(1),
        },
      });
    }

    // Step 5: Ranking
    matches.sort((a, b) => b.matchScore - a.matchScore);

    return new Response(JSON.stringify({ matches }), {
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
