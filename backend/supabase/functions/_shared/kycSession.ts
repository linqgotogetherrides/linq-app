// Pure, dependency-free helpers for creating Cashfree Secure ID KYC sessions.
//
// Kept free of Deno globals and of any Supabase/Cashfree client so it can be
// unit tested under `node --test`, which this repo already uses. The handler in
// ../create-kyc-session owns the network and database work.
//
// Sources (confirmed against official docs, not assumed):
//   * Generate KYC Link: /verification/form
//     https://www.cashfree.com/docs/api-reference/vrs/v2/kyc-links/generate-form-link
//     Required: phone, template_name, verification_id. Optional: name, email,
//     link_expiry. link_expiry is "YYYY-MM-DD" and may be at most 30 days out.
//     verification_id is capped at 50 characters, and an id carrying special
//     characters is a documented 400 ("Verification ID With Special Chars").
//     `name` accepts only alphanumeric, space, dot and hyphen
//     ("name should only contains alphanumeric, space, dot and hyphen").
//   * Get KYC Link Status: GET /verification/form?verificationID=...
//     https://www.cashfree.com/docs/api-reference/vrs/v2/kyc-links/get-form-status
//   * Signature: x-cf-signature is sent "if IP is not whitelisted".
//     https://www.cashfree.com/docs/api-reference/vrs/v2/generate-form-link

/** The only document types this app will ever request. */
export const DOC_TYPES = ["aadhaar", "pan", "dl"] as const;
export type DocType = (typeof DOC_TYPES)[number];

/**
 * The ONE template name Cashfree documents as a built-in default. PAN and
 * driving-licence templates are merchant-created in the Secure ID dashboard,
 * so their names cannot be known from code -- see resolveTemplateByDocType.
 */
export const CASHFREE_DEFAULT_TEMPLATE = "Aadhaar_verification";

/** link_expiry may be at most this many days out, per the docs. */
export const MAX_LINK_EXPIRY_DAYS = 30;
export const LINK_EXPIRY_DAYS = 7;

/** Cashfree caps verification_id at 50 characters. */
export const MAX_VERIFICATION_ID_LENGTH = 50;

/** A server misconfiguration, reported as a reason code rather than a leak. */
export class KycConfigError extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = "KycConfigError";
    this.reason = reason;
  }
}

/** Narrow an untrusted value to a supported document type. */
export function sanitizeDocType(value: unknown): DocType | null {
  if (typeof value !== "string") return null;
  const lower = value.trim().toLowerCase();
  return (DOC_TYPES as readonly string[]).includes(lower) ? (lower as DocType) : null;
}

/**
 * An opaque verification_id: 32 lowercase hex characters.
 *
 * Two deliberate changes from the old implementation, which built the id as
 * `v_<userId>_<docAbbr>_<unix>`:
 *
 *   1. No user data. The id used to embed the rider's uid, and it is echoed
 *      back on webhooks and accepted by the status API, so it leaked an
 *      identifier through provider logs and any place an id was displayed.
 *   2. No special characters. The docs list "Verification ID With Special
 *      Chars" as a 400, and the old id relied on underscores being tolerated.
 *      Hex cannot contain one, so the question does not arise.
 */
export function newVerificationId(): string {
  return crypto.randomUUID().replace(/-/g, "").toLowerCase();
}

/** Last-resort guard that a generated id satisfies the documented constraints. */
export function isAcceptableVerificationId(id: string): boolean {
  return /^[a-z0-9]+$/.test(id) && id.length > 0 && id.length <= MAX_VERIFICATION_ID_LENGTH;
}

/**
 * An Indian mobile number as Cashfree wants it: ten digits.
 *
 * Accepts either a bare ten-digit number or one behind the +91 country code,
 * because profiles store the latter (`userProfile.ts` writes "+<number>").
 * The prefix is matched explicitly rather than reached by slicing the last ten
 * digits: that would silently "accept" a thirteen-digit typo by discarding the
 * extra characters, which is exactly the coercion that let an over-long
 * emergency contact through earlier in this codebase.
 *
 * Returns null when nothing usable remains, so the caller can refuse rather than
 * send a number Cashfree will reject.
 */
export function normalizeIndianPhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return null;
}

/**
 * Strip a profile name down to the documented character set.
 *
 * Cashfree rejects a name containing anything other than alphanumeric, space,
 * dot and hyphen with a 400. Real rider names routinely contain apostrophes or
 * non-Latin characters, so an unsanitised name is a live source of failures.
 * Returns null when nothing usable remains, in which case the optional field is
 * simply omitted rather than sent empty.
 */
export function sanitizeCashfreeName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .normalize("NFKD")
    // Drop combining marks left behind by NFKD, then anything still outside
    // the documented set.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 64) : null;
}

/** link_expiry as the documented `YYYY-MM-DD`. */
export function linkExpiryDate(now: Date = new Date()): string {
  const days = Math.min(LINK_EXPIRY_DAYS, MAX_LINK_EXPIRY_DAYS);
  const at = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return at.toISOString().slice(0, 10);
}

/**
 * Which template to send for a document type.
 *
 * PAN and driving-licence template names are NOT hardcoded here. The previous
 * implementation defaulted them to "PAN_verification" and
 * "Driving_License_verification", which appear nowhere in this project and are
 * not documented by Cashfree -- an invalid template_name is a documented 400
 * ("template name should be valid"), and that is the most likely reason a PAN
 * request failed while Aadhaar succeeded.
 *
 * So they must be configured explicitly via secrets. Only Aadhaar keeps a
 * default, because that is the one name Cashfree documents as built in.
 */
export function resolveTemplateByDocType(
  docType: DocType,
  env: { CASHFREE_TEMPLATE_AADHAAR?: string; CASHFREE_TEMPLATE_PAN?: string; CASHFREE_TEMPLATE_DL?: string },
): string {
  if (docType === "aadhaar") {
    return env.CASHFREE_TEMPLATE_AADHAAR?.trim() || CASHFREE_DEFAULT_TEMPLATE;
  }
  const key = docType === "pan" ? "CASHFREE_TEMPLATE_PAN" : "CASHFREE_TEMPLATE_DL";
  const configured = env[key]?.trim();
  if (!configured) {
    throw new KycConfigError(
      "template_not_configured",
      `${key} is not set. Set it to a template name that exists in the Cashfree Secure ID dashboard.`,
    );
  }
  return configured;
}

/**
 * Validate the Cashfree configuration this function needs.
 *
 * CASHFREE_PUBLIC_KEY is REQUIRED, not optional. The signature header is only
 * needed "if IP is not whitelisted", and Supabase Edge egress IPs rotate, so
 * whitelisting is not a workable alternative and this deployment takes the
 * 2FA path. The key must belong to the SAME Cashfree environment as the client
 * id and secret -- a key from different or regenerated test credentials will
 * produce a signature Cashfree rejects.
 */
export function resolveCashfreeConfig(env: Record<string, string | undefined>): {
  clientId: string;
  secretKey: string;
  publicKey: string;
  baseUrl: string;
  isProd: boolean;
} {
  const required = (name: string, reason: string): string => {
    const value = env[name];
    if (!value || !value.trim()) {
      throw new KycConfigError(reason, `${name} is not set`);
    }
    return value.trim();
  };

  const clientId = required("CASHFREE_APP_ID", "cashfree_app_id_missing");
  const secretKey = required("CASHFREE_SECRET_KEY", "cashfree_secret_key_missing");
  const publicKey = required("CASHFREE_PUBLIC_KEY", "cashfree_public_key_missing");

  const isProd = (env.CASHFREE_ENVIRONMENT ?? "sandbox").trim().toLowerCase() === "production";

  return {
    clientId,
    secretKey,
    publicKey,
    isProd,
    // Secure ID base, NOT the Payment Gateway host.
    baseUrl: isProd
      ? "https://api.cashfree.com/verification"
      : "https://sandbox.cashfree.com/verification",
  };
}

/**
 * What to do about an existing pending session for this rider and document.
 *
 * Derived from Cashfree's own reported state rather than a locally computed
 * expiry, so the answer cannot drift from what Cashfree actually thinks.
 */
export type SessionDecision = "create" | "reuse" | "supersede";

export function decideSessionAction(formStatus: string | null | undefined): SessionDecision {
  if (!formStatus) return "supersede";
  if (formStatus.toUpperCase() === "EXPIRED") return "supersede";
  return "reuse";
}

/** Pulls the fields we forward out of a Generate KYC Link response. */
export function readFormLink(response: unknown): { formLink: string; referenceId: number | null } | null {
  if (!response || typeof response !== "object") return null;
  const data = response as { form_link?: unknown; reference_id?: unknown };
  if (typeof data.form_link !== "string" || data.form_link.length === 0) return null;
  return {
    formLink: data.form_link,
    referenceId: typeof data.reference_id === "number" ? data.reference_id : null,
  };
}