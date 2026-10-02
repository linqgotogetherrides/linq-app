import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const CASHFREE_APP_ID = Deno.env.get("CASHFREE_APP_ID") ?? "";
const CASHFREE_SECRET_KEY = Deno.env.get("CASHFREE_SECRET_KEY") ?? "";
const isProd = false; // set to true for production

const CASHFREE_BASE_URL = isProd
  ? "https://api.cashfree.com/verification"
  : "https://sandbox.cashfree.com/verification";

/** Encrypts `clientId.unixTimestamp` with RSA-OAEP/SHA-1 + the Cashfree public key. */
async function generateCfSignature(clientId: string): Promise<string> {
  const pem = (Deno.env.get("CASHFREE_PUBLIC_KEY") ?? "").replace(/\\n/g, "\n");
  if (!pem) throw new Error("CASHFREE_PUBLIC_KEY secret is not set");
  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "spki",
    der,
    { name: "RSA-OAEP", hash: "SHA-1" },
    false,
    ["encrypt"],
  );
  const data = new TextEncoder().encode(`${clientId}.${Math.floor(Date.now() / 1000)}`);
  const encrypted = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, data);
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    // Users sign in with Firebase phone OTP or Supabase Google OAuth, so there
    // is no Supabase session to validate for phone users. Identity is the uid
    // the app already uses client-side; the webhook later marks verification
    // via the service role.
    const body = await req.json().catch(() => ({}));
    const userId: string | undefined = body?.userId;
    const type: string = (body?.type ?? "aadhaar").toLowerCase();
    if (!userId) throw new Error("Missing userId");
    if (!["aadhaar", "pan", "dl"].includes(type)) throw new Error("Invalid document type");

    // Call Cashfree to generate a verification session
    // NOTE: This is a pseudo-implementation based on standard Cashfree Verification APIs
    // The exact endpoint depends on whether you are doing offline aadhaar, PAN API, etc.
    // For a unified UI flow, Cashfree provides Identity Verification links

    // Cashfree caps verification_id at 50 chars; compress the parts.
    const typeAbbr: Record<string, string> = { aadhaar: "a", pan: "p", dl: "d" };
    const verificationId = `v_${userId}_${typeAbbr[type]}_${Math.floor(Date.now() / 1000)}`;

    // 2FA: sign "clientId.unixTimestamp" with RSA-OAEP-SHA1 using the Cashfree
    // public key, exactly like their docs describe. Avoids IP whitelisting,
    // which is unworkable since Supabase edge egress IPs rotate.
    const signature = await generateCfSignature(CASHFREE_APP_ID);

    // Cashfree KYC Link API: POST /verification/form. Needs the rider's name
    // and phone, so pull them from their profile row with the service role.
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("name, phone_number, email")
      .eq("id", userId)
      .maybeSingle();

    const phone = (profile?.phone_number ?? "").replace(/\D/g, "").slice(-10);
    if (!phone) throw new Error("No phone number on profile. Add one before verifying.");

    // Template names come from the Cashfree dashboard. Defaults match the
    // standard templates; override via secrets if your dashboard differs.
    const TEMPLATES: Record<string, string> = {
      aadhaar: Deno.env.get("CASHFREE_TEMPLATE_AADHAAR") ?? "Aadhaar_verification",
      pan: Deno.env.get("CASHFREE_TEMPLATE_PAN") ?? "PAN_verification",
      dl: Deno.env.get("CASHFREE_TEMPLATE_DL") ?? "Driving_License_verification",
    };

    const linkExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const response = await fetch(`${CASHFREE_BASE_URL}/form`, {
      method: "POST",
      headers: {
        "x-client-id": CASHFREE_APP_ID,
        "x-client-secret": CASHFREE_SECRET_KEY,
        "x-cf-signature": signature,
        "x-api-version": "2023-12-18",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: profile?.name || "LinQ User",
        phone,
        email: profile?.email || undefined,
        template_name: TEMPLATES[type],
        verification_id: verificationId.slice(0, 50),
        link_expiry: linkExpiry,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Cashfree API error: ${response.status} ${errText.slice(0, 200)}`);
    }
    const data = await response.json();
    if (!data.form_link) {
      throw new Error("Cashfree did not return a verification URL");
    }

    return new Response(
      JSON.stringify({
        verificationUrl: data.form_link,
        verificationId,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
});
