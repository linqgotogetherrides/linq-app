import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

import {
  KycConfigError,
  decideSessionAction,
  isAcceptableVerificationId,
  linkExpiryDate,
  newVerificationId,
  normalizeIndianPhone,
  readFormLink,
  resolveCashfreeConfig,
  resolveTemplateByDocType,
  sanitizeCashfreeName,
  sanitizeDocType,
} from "../_shared/kycSession.ts";

/**
 * Creates a Cashfree Secure ID KYC session for the authenticated rider.
 *
 * WHAT WAS WRONG
 *   1. It never verified the caller. It only checked that an Authorization
 *      header was PRESENT, then trusted a client-supplied `userId` from the
 *      request body. Any caller could open a KYC session in another rider's
 *      name.
 *   2. It defaulted the PAN and driving-licence template names to
 *      "PAN_verification" / "Driving_License_verification". Neither is
 *      documented by Cashfree and neither appears anywhere in this project.
 *      An invalid template_name is a documented 400, which is the most likely
 *      reason PAN failed while Aadhaar worked.
 *   3. It embedded the rider's uid inside verification_id, leaking an
 *      identifier into provider logs and webhook echoes.
 *   4. It created a brand new Cashfree form on every tap, with no mapping in
 *      kyc_sessions, so the hardened webhook could never resolve the rider and
 *      would drop every event as "unknown".
 *   5. It returned a generic 400 for every failure, including server
 *      misconfiguration and auth failures, so the cause was invisible.
 *
 * WHAT IS TRUE NOW
 *   1. The rider is the identity Supabase resolves from the bearer token. There
 *      is no user id in the request body at all.
 *   2. PAN and DL template names must be configured; nothing is invented.
 *   3. verification_id is opaque 32 hex characters.
 *   4. Every session is recorded in kyc_sessions, which is what lets the
 *      webhook resolve who a Cashfree event belongs to.
 *   5. Failures are separated by cause: 401 auth, 400 request, 500 config or
 *      provider, each with a reason code and a matching log line.
 *
 * This function NEVER writes verification_status = 'verified'. Only the
 * Cashfree webhook may do that, via apply_kyc_outcome().
 */

const CASHFREE_API_VERSION = "2023-12-18";

type LogEvent =
  | "config_invalid"
  | "unauthenticated"
  | "invalid_request"
  | "session_created"
  | "session_reused"
  | "session_superseded"
  | "provider_error";

function log(event: LogEvent, fields: Record<string, string | number | boolean | null> = {}) {
  console.log(JSON.stringify({ fn: "create-kyc-session", event, ...fields }));
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * RSA-OAEP/SHA-1 over `clientId.unixTimestamp`, per Cashfree's 2FA docs.
 * The public key belongs to the Cashfree environment named by the credentials
 * in use; a key from different or regenerated test credentials yields a
 * signature Cashfree rejects.
 */
async function generateCfSignature(clientId: string, publicKeyPem: string): Promise<string> {
  const pem = publicKeyPem.replace(/\\n/g, "\n");
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
  const bytes = new Uint8Array(encrypted);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Resolve the caller from the bearer token.
 *
 * Supabase validates the token against whichever issuer the hosted project has
 * configured as Third-Party Auth (Firebase for phone sign-in, Supabase Auth for
 * Google/Apple). The returned id is the authoritative rider; nothing in the
 * request body participates in this decision.
 */
async function resolveCaller(req: Request): Promise<string | null> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const caller = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await caller.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, CORS_HEADERS);

  let config: ReturnType<typeof resolveCashfreeConfig>;
  try {
    config = resolveCashfreeConfig(Deno.env.toObject() as Record<string, string | undefined>);
  } catch (error: unknown) {
    const reason = error instanceof KycConfigError ? error.reason : "cashfree_config_invalid";
    log("config_invalid", { reason });
    // 500: the caller did nothing wrong, the deployment is misconfigured.
    return json({ error: "KYC is temporarily unavailable. Please try again later." }, 500, CORS_HEADERS);
  }

  const userId = await resolveCaller(req);
  if (!userId) {
    log("unauthenticated", { reason: "token_not_resolved" });
    return json({ error: "Please sign in to verify your ID." }, 401, CORS_HEADERS);
  }

  const body = await req.json().catch(() => ({}));
  const docType = sanitizeDocType((body as { type?: unknown })?.type);
  if (!docType) {
    log("invalid_request", { reason: "invalid_document_type" });
    return json({ error: "Unsupported document type." }, 400, CORS_HEADERS);
  }

  let templateName: string;
  try {
    templateName = resolveTemplateByDocType(docType, Deno.env.toObject() as Record<string, string | undefined>);
  } catch (error: unknown) {
    const reason = error instanceof KycConfigError ? error.reason : "template_not_configured";
    log("config_invalid", { reason, doc_type: docType });
    return json({ error: "This document type is not available yet." }, 500, CORS_HEADERS);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: profile } = await admin
    .from("user_profiles")
    .select("name, phone_number, email")
    .eq("id", userId)
    .maybeSingle();

  const phone = normalizeIndianPhone(profile?.phone_number);
  if (!phone) {
    log("invalid_request", { reason: "profile_phone_missing" });
    return json(
      { error: "Add a 10-digit phone number to your profile before verifying an ID." },
      400,
      CORS_HEADERS,
    );
  }

  const authHeaders = async (): Promise<Record<string, string>> => ({
    "x-client-id": config.clientId,
    "x-client-secret": config.secretKey,
    "x-cf-signature": await generateCfSignature(config.clientId, config.publicKey),
    "x-api-version": CASHFREE_API_VERSION,
    "Content-Type": "application/json",
  });

  /**
   * Ask Cashfree what is already there. Reusing a live form avoids spawning a
   * new one on every tap; the decision is taken from Cashfree's own status
   * rather than a locally computed expiry, so the two cannot drift.
   */
  const existingPending = async (): Promise<string | null> => {
    const { data } = await admin
      .from("kyc_sessions")
      .select("verification_id")
      .eq("user_id", userId)
      .eq("doc_type", docType)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.verification_id ?? null;
  };

  const fetchExistingForm = async (verificationId: string) => {
    const res = await fetch(
      `${config.baseUrl}/form?verificationID=${encodeURIComponent(verificationId)}`,
      { headers: await authHeaders() },
    );
    if (!res.ok) return null;
    // Parse once. A response body can only be consumed a single time.
    const parsed = await res.json().catch(() => null);
    const link = readFormLink(parsed);
    if (!link) return null;
    const formStatus = (parsed as { form_status?: string } | null)?.form_status ?? null;
    return { link, formStatus };
  };

  const pendingId = await existingPending();

  if (pendingId) {
    const existing = await fetchExistingForm(pendingId);
    if (existing && decideSessionAction(existing.formStatus) === "reuse") {
      log("session_reused", { doc_type: docType });
      return json(
        { verificationUrl: existing.link.formLink, verificationId: pendingId, docType, reused: true },
        200,
        CORS_HEADERS,
      );
    }

    // Cashfree reports the old link expired (or cannot be read). Retire it so
    // the one-pending-per-document index is free for the new session.
    await admin
      .from("kyc_sessions")
      .update({ status: "expired" })
      .eq("verification_id", pendingId)
      .eq("status", "pending");
    log("session_superseded", { doc_type: docType });
  }

  const verificationId = newVerificationId();
  if (!isAcceptableVerificationId(verificationId)) {
    log("config_invalid", { reason: "generated_id_rejected" });
    return json({ error: "KYC is temporarily unavailable. Please try again later." }, 500, CORS_HEADERS);
  }

  const name = sanitizeCashfreeName(profile?.name);

  let created: Awaited<ReturnType<typeof readFormLink>> = null;
  try {
    const res = await fetch(`${config.baseUrl}/form`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({
        ...(name ? { name } : {}),
        phone,
        ...(profile?.email ? { email: profile.email } : {}),
        template_name: templateName,
        verification_id: verificationId,
        link_expiry: linkExpiryDate(),
      }),
    });

    if (!res.ok) {
      // Code only, bounded. The provider's body can echo request fields, so it
      // is never logged whole.
      log("provider_error", {
        stage: "create",
        doc_type: docType,
        http_status: res.status,
        reason: "cashfree_rejected",
      });
      return json(
        { error: "We could not start verification for that document. Please try again." },
        502,
        CORS_HEADERS,
      );
    }
    created = readFormLink(await res.json());
  } catch {
    log("provider_error", { stage: "create", doc_type: docType, reason: "cashfree_unreachable" });
    return json(
      { error: "We could not reach the verification provider. Please try again." },
      502,
      CORS_HEADERS,
    );
  }

  if (!created) {
    log("provider_error", { stage: "create", doc_type: docType, reason: "no_form_link_returned" });
    return json(
      { error: "We could not start verification for that document. Please try again." },
      502,
      CORS_HEADERS,
    );
  }

  // Record the mapping. This row is the ONLY thing that lets the webhook know
  // which rider a Cashfree event belongs to.
  const { error: insertError } = await admin.from("kyc_sessions").insert({
    verification_id: verificationId,
    user_id: userId,
    doc_type: docType,
    reference_id: created.referenceId,
    status: "pending",
  });

  if (insertError) {
    // 23505 = unique violation on kyc_sessions_one_pending_per_doc. Two requests
    // raced; the index made one of them lose, which is exactly the intended
    // concurrency guard. Reuse the winner rather than creating a second form.
    if (insertError.code === "23505") {
      const winner = await existingPending();
      if (winner && winner !== verificationId) {
        const existing = await fetchExistingForm(winner);
        if (existing) {
          log("session_reused", { doc_type: docType, reason: "concurrent_request" });
          return json(
            { verificationUrl: existing.link.formLink, verificationId: winner, docType, reused: true },
            200,
            CORS_HEADERS,
          );
        }
      }
    }
    log("provider_error", { stage: "persist", doc_type: docType, reason: "session_insert_failed" });
    return json(
      { error: "We could not start verification for that document. Please try again." },
      500,
      CORS_HEADERS,
    );
  }

  // 'pending' means a real Cashfree session exists. Only the webhook writes
  // 'verified'; see 20261015090000_apply_kyc_outcome.sql.
  await admin
    .from("user_profiles")
    .update({ verification_status: "pending", verification_document: docType })
    .eq("id", userId);

  log("session_created", { doc_type: docType, has_reference_id: created.referenceId !== null });
  return json(
    { verificationUrl: created.formLink, verificationId, docType, reused: false },
    200,
    CORS_HEADERS,
  );
});