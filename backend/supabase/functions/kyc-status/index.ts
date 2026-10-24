import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

import { bearerToken, buildStatusResponse } from "../_shared/kycStatus.ts";

/**
 * Authoritative KYC status for the authenticated rider.
 *
 * WHAT THIS IS FOR
 *   The app used to guess. VerificationWebView fired `onSuccess()` whenever the
 *   WebView URL contained "verification-success" -- a substring match on a URL
 *   nobody had configured as a return_url -- and the screen then wrote
 *   verification_status straight to user_profiles from the client. A URL in a
 *   WebView is not evidence of a verified document.
 *
 *   This endpoint replaces that guess with a read of the same rows the verified
 *   Cashfree webhook writes. It is the only thing the client is allowed to
 *   believe about verification state.
 *
 * IDENTITY AND OWNERSHIP
 *   The rider comes from auth.getUser() on the bearer token, never from the
 *   request. The endpoint accepts NO parameters at all, so there is nothing for
 *   a caller to point at another rider: the only WHERE clause is built from the
 *   authenticated id, and kyc_sessions is service-role only.
 *
 * THIS NEVER WRITES
 *   Read-only, deliberately. kyc-webhook is the single writer of terminal
 *   states, inside apply_kyc_outcome's transaction. If this endpoint could
 *   write, a client-triggered poll could race the one trusted path.
 *
 * THIS NEVER CALLS CASHFREE
 *   See _shared/kycStatus.ts for why the documented Get KYC Link Status endpoint
 *   is not used as a status source: its form_status enum is not enumerated in
 *   the docs, and mapping an unenumerated value onto a verification verdict
 *   would be a guess in the one direction that must never be guessed.
 */

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type LogEvent = "unauthenticated" | "read_failed" | "read";

function log(event: LogEvent, fields: Record<string, string | number | boolean | null> = {}) {
  console.log(JSON.stringify({ fn: "kyc-status", event, ...fields }));
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = bearerToken(req.headers.get("Authorization"));
  if (!token) {
    log("unauthenticated", { reason: "missing_bearer" });
    return json({ error: "Please sign in to check your verification status." }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

  // The caller's own token, so Supabase validates it against the configured
  // third-party issuer (Firebase for phone sign-in, Supabase Auth for OAuth).
  const caller = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await caller.auth.getUser(token);
  if (error || !data?.user?.id) {
    log("unauthenticated", { reason: "token_not_resolved" });
    return json({ error: "Please sign in to check your verification status." }, 401);
  }
  const userId = data.user.id;

  // Service role, because kyc_sessions has no client policy by design.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: rows, error: readError } = await admin
    .from("kyc_sessions")
    // The only filter is the authenticated id. There is no client-supplied
    // verification_id or user id in this query, or anywhere in this function.
    .select("doc_type, status")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    // A rider cannot accumulate unlimited sessions; this bounds the read and
    // the response without hiding any state that matters.
    .limit(50);

  if (readError) {
    // Code only. A PostgREST message can echo query fragments.
    log("read_failed", { reason: String(readError.code ?? "query_failed").slice(0, 40) });
    return json({ error: "Could not read your verification status. Please try again." }, 500);
  }

  const response = buildStatusResponse(rows ?? [], new Date().toISOString());

  // Counts only. No user id, no verification id, no document identifiers.
  log("read", {
    status: response.status,
    document_count: response.documents.length,
  });

  return json(response, 200);
});