// Shared helpers for the LinQ SOS Safety Edge Functions.
//
// Security posture:
//   * Every function runs with the service-role key, which is NEVER exposed to
//     the mobile client. Clients only ever call these functions over HTTPS with
//     the public anon key.
//   * `requireClientAuthorization` mirrors the existing Razorpay functions: the
//     Authorization bearer must match the apikey header, which blocks other
//     origins from replaying a captured anon key against a browser.
//   * `requireUserId` guarantees an explicit identity, because LinQ authenticates
//     with Firebase UIDs and has no `auth.uid()` to read on the server yet.
//   * Background location updates additionally carry an HMAC tracking token
//     minted at activation time, so a leaked anon key still cannot forge
//     location pings for somebody else's incident.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export const EVIDENCE_BUCKET = "sos-evidence";
export const TRACKING_TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12h

export class SosError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "SosError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new SosError(500, "config_missing", `${name} is not configured`);
  return value;
}

export function supabaseAdmin(): SupabaseClient {
  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

export function requireClientAuthorization(req: Request): void {
  const authorization = req.headers.get("Authorization")?.trim() ?? "";
  const apiKey = req.headers.get("apikey")?.trim() ?? "";
  if (!authorization || !apiKey || authorization !== `Bearer ${apiKey}`) {
    throw new SosError(401, "unauthorized", "Authentication required");
  }
}

export function requireUserId(body: Record<string, unknown>, field = "user_id"): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SosError(400, "user_id_required", `${field} is required`);
  }
  return value.trim();
}

export function requireString(
  body: Record<string, unknown>,
  field: string,
  options: { maxLength?: number } = {},
): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SosError(400, `${field}_required`, `${field} is required`);
  }
  const clean = value.trim();
  if (options.maxLength && clean.length > options.maxLength) {
    throw new SosError(400, `${field}_too_long`, `${field} is too long`);
  }
  return clean;
}

export function optionalString(
  body: Record<string, unknown>,
  field: string,
  options: { maxLength?: number } = {},
): string | null {
  const value = body[field];
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new SosError(400, `${field}_invalid`, `${field} must be a string`);
  }
  const clean = value.trim();
  if (!clean) return null;
  if (options.maxLength && clean.length > options.maxLength) {
    throw new SosError(400, `${field}_too_long`, `${field} is too long`);
  }
  return clean;
}

export function optionalNumber(
  body: Record<string, unknown>,
  field: string,
  options: { min?: number; max?: number } = {},
): number | null {
  const value = body[field];
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new SosError(400, `${field}_invalid`, `${field} must be a number`);
  }
  if (options.min != null && parsed < options.min) {
    throw new SosError(400, `${field}_range`, `${field} is below the allowed range`);
  }
  if (options.max != null && parsed > options.max) {
    throw new SosError(400, `${field}_range`, `${field} is above the allowed range`);
  }
  return parsed;
}

export function requireCoordinates(
  body: Record<string, unknown>,
  options: { allowMissing?: boolean } = {},
): { latitude: number | null; longitude: number | null; accuracy: number | null } {
  const latitude = optionalNumber(body, "latitude", { min: -90, max: 90 });
  const longitude = optionalNumber(body, "longitude", { min: -180, max: 180 });

  if (latitude == null || longitude == null) {
    if (options.allowMissing) return { latitude: null, longitude: null, accuracy: null };
    throw new SosError(400, "coordinates_required", "latitude and longitude are required");
  }
  return { latitude, longitude, accuracy: optionalNumber(body, "accuracy", { min: 0 }) };
}

export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new SosError(400, "invalid_json", "A JSON object body is required");
  }
}

// ---------------------------------------------------------------------------
// HMAC tracking token (guards background location pings)
// ---------------------------------------------------------------------------

function trackingSecret(): string {
  return Deno.env.get("SOS_TRACKING_SECRET")?.trim() || requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function base64UrlEncode(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
}

export async function mintTrackingToken(
  sosId: string,
  userId: string,
  ttlMs: number = TRACKING_TOKEN_TTL_MS,
): Promise<string> {
  const expiresAt = Date.now() + ttlMs;
  const payload = `${sosId}.${userId}.${expiresAt}`;
  const signature = await hmacHex(trackingSecret(), payload);
  return `${base64UrlEncode(payload)}.${signature}`;
}

export async function verifyTrackingToken(
  token: string,
  expectedSosId: string,
  expectedUserId: string,
): Promise<boolean> {
  if (!token || !token.includes(".")) return false;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return false;

  let payload: string;
  try {
    payload = base64UrlDecode(encodedPayload);
  } catch {
    return false;
  }

  const expectedSignature = await hmacHex(trackingSecret(), payload);
  if (expectedSignature.length !== signature.length) return false;

  let difference = 0;
  for (let index = 0; index < expectedSignature.length; index += 1) {
    difference |= expectedSignature.charCodeAt(index) ^ signature.charCodeAt(index);
  }
  if (difference !== 0) return false;

  const [sosId, userId, expiresAtRaw] = payload.split(".");
  if (sosId !== expectedSosId || userId !== expectedUserId) return false;
  const expiresAt = Number(expiresAtRaw);
  return Number.isFinite(expiresAt) && Date.now() < expiresAt;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function buildMapsUrl(latitude: number | null, longitude: number | null): string | null {
  if (latitude == null || longitude == null) return null;
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

export function buildReferenceCode(): string {
  const now = new Date();
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("");
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SOS-${stamp}-${random}`;
}

export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof SosError) {
    return jsonResponse(
      { error: error.message, code: error.code, details: error.details ?? null },
      error.status,
    );
  }
  console.error("SOS function error:", error);
  return jsonResponse({ error: "Unexpected SOS service error", code: "internal_error" }, 500);
}

export function optionsResponse(): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}
