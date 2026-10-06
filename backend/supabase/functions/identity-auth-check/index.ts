// =====================================================================
// TEMPORARY DIAGNOSTIC — NOT FOR PRODUCTION. NOT AUTO-DEPLOYED.
// =====================================================================
//
// Purpose: prove, against the HOSTED project, that a Firebase ID token sent as
// `Authorization: Bearer <token>` is accepted by Supabase and resolves to a
// user — and report which Postgres `role` the token maps to (this is the crux of
// whether `role: "authenticated"` custom claims are needed).
//
// This function ONLY calls supabase.auth.getUser(token) and echoes back a
// handful of NON-SECRET claims. It:
//   * never logs or stores the token,
//   * never returns the raw JWT,
//   * never touches any table,
//   * exposes no Cashfree/Supabase secrets.
//
// DELETE THIS FILE once the audit is complete. It is deliberately left
// undeployed; see the runbook in the surrounding conversation.
//
// Supabase's recommended way to verify a third-party token server-side is to
// create a client with the caller's Authorization header and call auth.getUser()
// (it validates against the project's configured third-party (Firebase) issuer).

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** Decodes JWT claim names/values we are allowed to surface (no secrets). */
function readClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const payload = JSON.parse(decoded) as Record<string, unknown>;
    return {
      // Only claim names that matter for the audit. `sub` is the Firebase UID.
      iss: payload.iss ?? null,
      aud: payload.aud ?? null,
      sub: payload.sub ?? null,
      role: payload.role ?? null,
      // Standard timing claims help spot an expired token.
      iat: payload.iat ?? null,
      exp: payload.exp ?? null,
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  const authorization = req.headers.get("Authorization")?.trim() ?? "";
  const token = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  if (!token) {
    return json(
      {
        ok: false,
        error: "missing_bearer",
        message: "Send the Firebase ID token as 'Authorization: Bearer <token>'.",
      },
      401,
    );
  }

  const claims = readClaims(token);

  try {
    // Isolated import keeps this self-contained like the other functions.
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.38.4");
    // The client is given the CALLER's token so getUser() verifies it against
    // the project's configured issuer (Supabase Auth or Firebase third-party).
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await client.auth.getUser(token);

    if (error || !data?.user) {
      return json(
        {
          ok: false,
          verified: false,
          error: error?.message ?? "no_user",
          // The decoded claims are included to diagnose issuer/audience/expiry
          // mismatches. They carry no secret material.
          token_claims: claims,
        },
        401,
      );
    }

    return json({
      ok: true,
      verified: true,
      // The authenticated identity (Firebase UID) — this is what auth.uid()
      // would return inside RLS/functions.
      uid: data.user.id,
      // `role` here is the role Supabase assigned to the token. If this is
      // "anon" (or null), the Firebase `role: "authenticated"` custom claim is
      // missing and must be added.
      role: data.user.role ?? null,
      is_anonymous: data.user.is_anonymous ?? null,
      // Non-secret claims for the audit.
      token_claims: claims,
    });
  } catch (error) {
    return json(
      {
        ok: false,
        verified: false,
        error: error instanceof Error ? error.message : "unexpected_error",
        token_claims: claims,
      },
      500,
    );
  }
});
