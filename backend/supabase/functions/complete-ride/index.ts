import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const { rideId, driverId } = await req.json();
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

    // Call the database function to complete the ride atomically
    const { data, error } = await supabase.rpc("complete_ride_trip", {
      p_ride_id: rideId,
      p_driver_id: driverId,
    });

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    return new Response(
      JSON.stringify(data),
      { headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
    });
  }
});