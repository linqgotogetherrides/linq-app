import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  try {
    const payload = await req.json();

    // Verify webhook signature (omitted for brevity, highly recommended in prod)

    // Extract data from the Cashfree payload
    const verificationId = payload.data?.verification_id;
    const status = payload.data?.status; // 'SUCCESS' or 'FAILED'

    if (verificationId && ["SUCCESS", "VERIFIED", "success", "verified"].includes(status)) {
      // The verificationId looks like 'v_USERID_<a|p|d>_TIMESTAMP'
      // (userIds from Firebase/Google auth contain no underscores).
      const parts = verificationId.split("_");
      const userId = parts[1];
      const docType = parts[2] === "a" ? "aadhaar" : parts[2] === "p" ? "pan" : parts[2] === "d" ? "dl" : "";

      // Use the Service Role Key to bypass RLS and update the user's status
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );

      await supabaseAdmin
        .from("user_profiles")
        .update({
          kyc_status: "verified",
          verification_status: "verified",
          verification_document: ["aadhaar", "pan", "dl"].includes(docType) ? docType : undefined,
          updated_at: new Date(),
        })
        .eq("id", userId);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return new Response(JSON.stringify({ error: message }), { status: 400 });
  }
});
