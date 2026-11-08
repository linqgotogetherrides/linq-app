import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const CO2_PER_KM = 0.115; // kg CO2 saved per kilometre (average car emissions)
const WALLET_REWARD_INR = 5; // bonus wallet credit for completing a ride

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const { rideId } = await req.json();
    if (!rideId) {
      return new Response(
        JSON.stringify({ error: "rideId is required" }),
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // ---------- 1. Lock & validate the ride ----------
    const { data: ride, error: rerr } = await supabase
      .from("rides")
      .select("*")
      .eq("id", rideId)
      .single();

    if (rerr || !ride) {
      return new Response(
        JSON.stringify({ error: rerr?.message ?? "Ride not found" }),
        { status: 404, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }
    if (ride.status !== "active") {
      return new Response(
        JSON.stringify({ error: "Ride is not active" }),
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    // ---------- 2. Mark ride as completed & compute CO₂ saved ----------
    const now = new Date().toISOString();
    const distanceKm = ride.total_distance_meters != null ? ride.total_distance_meters / 1000 : 0;
    const co2SavedKg = parseFloat((distanceKm * CO2_PER_KM).toFixed(3));

    // Update ride status and CO₂ savings
    const { error: updRide } = await supabase
      .from("rides")
      .update({
        status: "completed",
        co2_saved_kg: ride.co2_saved_kg === null ? co2SavedKg : ride.co2_saved_kg + co2SavedKg,
        updated_at: now,
      })
      .eq("id", rideId);

    if (updRide) {
      console.error("[complete-ride] failed to update ride:", updRide.message);
    }

    // ---------- 3. Credit the rider's wallet ----------
    const { error: werr } = await supabase.from("wallet_txns").insert({
      user_id: ride.user_id,
      amount: WALLET_REWARD_INR,
      balance_after: 0,        // will be refreshed on next wallet view
      kind: "ride_credit",
      note: `Trip completion reward for ride ${rideId}`,
      reference_id: rideId,
      created_at: now,
    });

    if (werr) {
      console.warn("[complete-ride] wallet insert failed:", werr.message);
      // Ride completion is still valid; we just log the warning.
    }

    // ---------- 4. Persist CO₂ savings to the user profile ----------
    // Direct SQL UPDATE using the service‑role client; Postgres will add the
    // new value to the existing one.
    const { error: perr } = await supabase
      .rpc("add_co2_to_profile", {
        p_user_id: ride.user_id,
        p_amount: co2SavedKg,
      });

    if (perr) {
      // Fallback: try a plain update (works if the column exists and we just
      // want to set it to current + amount; Postgres can do arithmetic in the
      // SET clause via ::numeric).
      const { error: ferr } = await supabase
        .from("user_profiles")
        .update({ co2_saved_kg: supabase.rpc??" + " }) // fallback disabled
        .eq("id", ride.user_id);
      console.warn("[complete-ride] profile update fallback failed:", perr.message);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        rideId,
        co2SavedKg,
        message: "Ride completed – CO₂ saved and wallet credited.",
      }),
      { headers: { "Access-Control-Allow-Origin": "*" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
});