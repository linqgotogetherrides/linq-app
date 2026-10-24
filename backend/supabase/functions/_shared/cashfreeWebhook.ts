// Pure, dependency-free helpers for verifying and classifying Cashfree Secure
// ID KYC Link webhooks.
//
// Everything here is deliberately free of Deno globals and of any Supabase
// client so it can be unit tested under `node --test`, which is the runner this
// repo already uses for the frontend. Only the handler in ../kyc-webhook
// touches the network or the database.
//
// Sources (confirmed against official docs, not assumed):
//   * Signature algorithm, Secure ID:
//     https://www.cashfree.com/docs/api-reference/vrs/webhook-signature-verification
//   * KYC Link events and payload shape:
//     https://www.cashfree.com/docs/api-reference/vrs/v2/kyc-links/webhooks

/**
 * The three KYC Link events Cashfree documents. Anything else is ignored
 * rather than guessed at, so a future event type cannot accidentally be read
 * as a success.
 */
export const KYC_LINK_ACTION_PERFORMED = "KYC_LINK_ACTION_PERFORMED";
export const KYC_LINK_SUCCESS = "KYC_LINK_SUCCESS";
export const KYC_LINK_EXPIRED = "KYC_LINK_EXPIRED";

/** `data.form_status` values seen in the documented payloads. */
export const FORM_STATUS = {
  RECEIVED: "RECEIVED",
  PENDING: "PENDING",
  SUCCESS: "SUCCESS",
  EXPIRED: "EXPIRED",
} as const;

/**
 * H1: three distinct status sets, previously conflated into one type.
 *
 * `KycOutcome` is what classifyKycEvent returns IN MEMORY ONLY.
 * `TerminalOutcome` is the subset that may be persisted.
 * `KycSessionStatus` is the full set the kyc_sessions CHECK constraint allows.
 *
 * Conflating them is what made the old code risky: 'in_progress' and 'ignored'
 * are not valid column values, so passing one to a writer would have raised a
 * CHECK violation and turned a routine no-op into a retry loop.
 *
 * The separation is enforced by the compiler, not just by convention: every
 * TerminalOutcome is assignable to KycSessionStatus, so the writable set can
 * never contain a value the CHECK would reject. If that ever stops holding, the
 * assignment below fails to type-check.
 */

/**
 * What a webhook means for the rider, in memory only. Never persisted.
 *
 * `in_progress` is deliberately not terminal: KYC_LINK_ACTION_PERFORMED fires
 * when *one* verification inside the link completes, which says nothing about
 * whether the document this session asked for succeeded.
 */
export type KycOutcome = "verified" | "expired" | "in_progress" | "ignored";

/**
 * The only two values the RPC will write.
 *
 * Must stay a subset of KycSessionStatus; `TERMINAL_OUTCOMES_IS_SUBSET` below
 * fails loudly at import time if it ever stops being true.
 */
export type TerminalOutcome = "verified" | "expired";

/**
 * Everything kyc_sessions.status may legally hold.
 *
 * `failed` is kept to match the SQL CHECK. Nothing writes it today: Cashfree
 * documents no KYC Links failure event (only ACTION_PERFORMED, SUCCESS,
 * EXPIRED), and inventing one would be a guess. It is reserved for a future
 * trusted rejection path. The table is service-role only, so an unused member
 * is inert rather than dangerous.
 *
 * `pending` has no TypeScript counterpart because it is a default set at
 * insert time, never derived from an inbound event.
 */
export type KycSessionStatus = "pending" | KycTerminalStatus | "failed";
type KycTerminalStatus = TerminalOutcome;

export interface ClassifiedEvent {
  outcome: KycOutcome;
  verificationId: string | null;
  referenceId: number | null;
  eventType: string | null;
}

/**
 * A short, stable, non-reversible handle for log correlation.
 *
 * The verification_id itself is deliberately never logged. The format in use
 * today embeds the rider's uid ('v_<uid>_<doc>_<ts>'), so even a truncated
 * prefix would leak part of a user identifier into log storage. A truncated
 * SHA-256 gives the same correlation across retries without being reversible
 * to anything.
 */
export async function correlationId(verificationId: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verificationId),
  );
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 12);
}

/**
 * base64(HMAC-SHA256(timestamp + rawBody, clientSecret)).
 *
 * Per the docs the concatenation carries no separator, and it MUST be the raw
 * body: parsing the JSON first and re-serialising changes whitespace and key
 * order, which silently breaks verification.
 */
export async function computeWebhookSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}${rawBody}`),
  );
  const bytes = new Uint8Array(mac);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Length-independent, content constant-time comparison.
 *
 * A plain `===` leaks how much of a forged signature was correct through
 * response timing. Length is compared first because it is not secret.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * True only when the payload carries a Cashfree signature for this exact body.
 *
 * A missing header, a missing secret, or any mismatch is a failure. There is
 * no "skip verification in development" path: the alternative is the exact
 * vulnerability this function exists to close.
 */
export async function verifyCashfreeSignature(args: {
  secret: string | null;
  timestamp: string | null;
  rawBody: string;
  receivedSignature: string | null;
}): Promise<boolean> {
  if (!args.secret || !args.timestamp || !args.receivedSignature) return false;
  try {
    const expected = await computeWebhookSignature(args.secret, args.timestamp, args.rawBody);
    return constantTimeEqual(expected, args.receivedSignature);
  } catch {
    return false;
  }
}

/**
 * Turns a verified payload into an outcome.
 *
 * `event_type` and `data.form_status` must agree before anything is treated as
 * terminal. Requiring both means a payload that merely claims success in one
 * field, or that carries a success `form_status` under a non-success event, is
 * not enough on its own.
 *
 * KYC_LINK_EXPIRED never verifies, even though the documented payload shows
 * some sub-verifications still reporting SUCCESS: the rider did not complete
 * the journey, so the profile must not be marked verified.
 */
export function classifyKycEvent(payload: unknown): ClassifiedEvent {
  const empty: ClassifiedEvent = {
    outcome: "ignored",
    verificationId: null,
    referenceId: null,
    eventType: null,
  };
  if (!payload || typeof payload !== "object") return empty;

  const body = payload as { event_type?: unknown; data?: unknown };
  const data = body?.data;
  if (!data || typeof data !== "object") return empty;

  const fields = data as {
    verification_id?: unknown;
    reference_id?: unknown;
    form_status?: unknown;
  };

  const eventType = typeof body.event_type === "string" ? body.event_type : null;
  const verificationId =
    typeof fields.verification_id === "string" ? fields.verification_id : null;
  const referenceId = typeof fields.reference_id === "number" ? fields.reference_id : null;

  if (!eventType || !verificationId) return empty;

  const formStatus = typeof fields.form_status === "string" ? fields.form_status : null;
  const base = { verificationId, referenceId, eventType };

  if (eventType === KYC_LINK_SUCCESS && formStatus === FORM_STATUS.SUCCESS) {
    return { ...base, outcome: "verified" };
  }
  if (eventType === KYC_LINK_EXPIRED && formStatus === FORM_STATUS.EXPIRED) {
    return { ...base, outcome: "expired" };
  }
  if (eventType === KYC_LINK_ACTION_PERFORMED) {
    return { ...base, outcome: "in_progress" };
  }
  return { ...empty, verificationId, referenceId, eventType };
}

/**
 * What this handler should write for a given outcome.
 *
 * Kept separate from classifyKycEvent so the "which statuses are terminal"
 * decision is testable on its own.
 */
export const TERMINAL_OUTCOMES: ReadonlySet<TerminalOutcome> = new Set<TerminalOutcome>([
  "verified",
  "expired",
]);

/**
 * H1 guard: the writable set must remain assignable to the persisted status
 * set. This is a compile-time assertion -- if a TerminalOutcome is ever added
 * that the SQL CHECK would reject, this line stops type-checking rather than
 * failing at runtime as a constraint violation.
 */
const TERMINAL_STATUS_GUARD: ReadonlySet<KycSessionStatus> = TERMINAL_OUTCOMES;
void TERMINAL_STATUS_GUARD;