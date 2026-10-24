import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

import {
  TERMINAL_OUTCOMES,
  classifyKycEvent,
  correlationId,
  verifyCashfreeSignature,
  type TerminalOutcome,
} from "../_shared/cashfreeWebhook.ts";

/**
 * Cashfree KYC Link webhook.
 *
 * WHAT WAS WRONG
 *   1. No signature verification, and the rider was recovered by splitting the
 *      attacker-controlled verification_id on "_":
 *
 *          const parts = verificationId.split("_");
 *          const userId = parts[1];
 *          ... .update({ kyc_status: "verified" }).eq("id", userId);
 *
 *      With the service-role key that bypasses RLS, so anyone who could reach
 *      this URL could mark any account verified by posting
 *      {"data":{"verification_id":"v_<victim-uid>_a_1","status":"SUCCESS"}}.
 *
 *   2. It read data.status, which KYC Links payloads do not carry -- the
 *      documented field is data.form_status -- so no genuine event ever matched
 *      either. Nobody could be verified by this route.
 *
 *   3. The session and profile updates were two separate transactions. A failure
 *      on the second left the session committed as 'verified', so the retry's
 *      idempotency guard short-circuited and the profile was never written.
 *
 * WHAT IS TRUE NOW
 *   1. POST only.
 *   2. Signature verified against the RAW body and x-webhook-timestamp before
 *      anything else touches the database.
 *   3. The rider comes from kyc_sessions, a service-role-only table populated
 *      when the session was created. The verification_id is never parsed.
 *   4. Both writes happen inside one Postgres transaction, via
 *      apply_kyc_outcome(). Either both land or neither does.
 *   5. Only documented terminal outcomes change anything, and only for a
 *      verification_id we actually issued.
 *   6. Redelivery and concurrent delivery are safe.
 *
 * REQUIRES verify_jwt = false, because Cashfree cannot present a Supabase JWT.
 * With the default (true) the platform rejects every delivery with 401 before
 * this code runs. See [functions.kyc-webhook] in backend/supabase/config.toml
 * and pass --no-verify-jwt when deploying.
 *
 * LOGGING
 *   Structured and deliberately narrow. The payload carries the rider's name,
 *   phone, email and document identifiers, so it is never logged, and neither
 *   is any signature value. Logged fields are limited to an event name, a
 *   reason code, Cashfree's own numeric reference_id, and a truncated SHA-256
 *   of the verification_id (correlationId), which cannot be reversed to a uid.
 */

const CLIENT_SECRET = Deno.env.get("CASHFREE_SECRET_KEY") ?? null;

/** Events this handler emits. Keep this list small and reason-coded. */
type LogEvent =
  | "signature_rejected"
  | "invalid_json"
  | "event_ignored"
  | "session_unknown"
  | "outcome_applied"
  | "outcome_no_change"
  | "apply_failed";

function log(event: LogEvent, fields: Record<string, string | number | boolean | null> = {}) {
  // console.log, not console.info: Deno edge logs surface stdout on every
  // plan, whereas info is filtered on some.
  console.log(JSON.stringify({ fn: "kyc-webhook", event, ...fields }));
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  // Read the body exactly once, as text. Parsing and re-serialising would
  // change whitespace and key order and break the HMAC.
  const rawBody = await req.text();

  const verified = await verifyCashfreeSignature({
    secret: CLIENT_SECRET,
    timestamp: req.headers.get("x-webhook-timestamp"),
    rawBody,
    receivedSignature: req.headers.get("x-webhook-signature"),
  });
  if (!verified) {
    // No detail about which check failed, and nothing written.
    log("signature_rejected", {
      reason: !CLIENT_SECRET
        ? "client_secret_not_configured"
        : "signature_mismatch",
    });
    return json({ error: "invalid_signature" }, 400);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    log("invalid_json", { reason: "unparseable_body" });
    return json({ error: "invalid_json" }, 400);
  }

  const event = classifyKycEvent(payload);
  const ref = event.referenceId;

  // An event we do not recognise, or one that is not a documented terminal
  // outcome, is acknowledged and dropped. Answering 200 keeps Cashfree from
  // retrying something we will never act on.
  if (!TERMINAL_OUTCOMES.has(event.outcome as TerminalOutcome) || !event.verificationId) {
    log("event_ignored", {
      outcome: event.outcome,
      event_type: event.eventType,
      reference_id: ref,
      reason: !event.verificationId
        ? "missing_verification_id"
        : "not_a_terminal_outcome",
    });
    return json({ received: true, outcome: event.outcome }, 200);
  }

  const outcome = event.outcome as TerminalOutcome;
  const cid = await correlationId(event.verificationId);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // One transaction. The function resolves the rider itself from
  // kyc_sessions, so nothing here names a user.
  const { data, error } = await admin.rpc("apply_kyc_outcome", {
    p_verification_id: event.verificationId,
    p_outcome: outcome,
  });

  if (error) {
    log("apply_failed", {
      outcome,
      reference_id: ref,
      correlation_id: cid,
      // Code only. PostgREST messages can echo query fragments, so they are
      // truncated to a bounded length rather than logged whole.
      reason: String(error.code ?? "rpc_error").slice(0, 40),
    });
    // 500 so Cashfree retries. The transaction rolled back, so a retry is
    // genuinely able to complete the work this attempt abandoned.
    return json({ error: "apply_failed" }, 500);
  }

  const row = Array.isArray(data) ? data[0] : null;
  const changed = row?.changed === true;
  const resolvedUserId = typeof row?.resolved_user_id === "string" ? row.resolved_user_id : null;

  // No session matched. This is permanent, not transient: we never mint rows
  // here, so an id we did not issue will never become one. Answering 200 stops
  // Cashfree burning retries on it, and the warn-level log makes the drop
  // visible instead of silent. If kyc_sessions is unexpectedly empty in
  // production, these lines are the signal that the pipeline is misconfigured.
  if (!changed && resolvedUserId === null) {
    log("session_unknown", {
      outcome,
      reference_id: ref,
      correlation_id: cid,
      reason: "no_matching_session",
    });
    return json({ received: true, outcome: "unrecognised" }, 200);
  }

  log(changed ? "outcome_applied" : "outcome_no_change", {
    outcome,
    reference_id: ref,
    correlation_id: cid,
  });
  return json({ received: true, outcome, changed }, 200);
});