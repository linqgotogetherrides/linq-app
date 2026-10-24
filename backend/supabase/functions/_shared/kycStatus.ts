// Pure helpers for the authenticated KYC status endpoint.
//
// No Deno globals, no Supabase client, no Cashfree call, so all of it is unit
// testable under `node --test`. The endpoint in ../kyc-status owns the network
// and database work.
//
// WHY THIS IS DATABASE-ONLY AND NEVER CALLS CASHFREE
//   Cashfree documents a Get KYC Link Status endpoint
//   (GET /verification/form?verificationID=...), so querying it server-side is
//   possible. It is deliberately NOT used to decide verification state, for three
//   reasons:
//
//     1. The docs show `form_status` only in examples -- PENDING, RECEIVED,
//        SUCCESS, EXPIRED -- and never enumerate it. The documented `FAILED`
//        value appears on verification_details[].status, a different field.
//        Mapping an unenumerated enum onto our own terminal states would be a
//        guess, and a wrong guess in the "verified" direction is the exact
//        failure this whole pipeline exists to prevent.
//
//     2. It would create a second writer. kyc-webhook is the only path allowed
//        to set 'verified', and it does so transactionally, from a signed
//        Cashfree event. A poll-triggered write would race it.
//
//     3. It costs a provider round trip on every poll, for a value we already
//        hold authoritatively.
//
//   kyc_sessions is therefore the single source of truth. A session sits at
//   'pending' until the webhook records a terminal outcome, and no amount of
//   client polling can change that.

import type { DocType } from './kycSession.ts';

export { DOC_TYPES } from './kycSession.ts';
export type { DocType } from './kycSession.ts';

/** Persisted lifecycle states. Mirrors the kyc_sessions CHECK constraint. */
export const SESSION_STATUSES = ['pending', 'verified', 'failed', 'expired'] as const;
export type KycSessionStatus = (typeof SESSION_STATUSES)[number];

/** What the rider's profile screen shows. */
export type DisplayStatus = 'not_verified' | 'pending' | 'verified';

export interface DocumentStatus {
  type: DocType;
  status: KycSessionStatus;
}

export interface KycStatusResponse {
  status: DisplayStatus;
  verifiedDocument: DocType | null;
  documents: DocumentStatus[];
  /** Lets the client detect a stale response without trusting any of it. */
  serverTime: string;
}

const DOC_TYPE_SET = new Set<string>(['aadhaar', 'pan', 'dl']);

/**
 * Terminal at the SESSION level means "a trusted server-side outcome already
 * decided this". 'pending' is the only unresolved session state.
 *
 * Note this is deliberately NOT the same question as "should the client stop
 * polling", which is asked over DISPLAY states, where the unresolved value is
 * also 'pending' but the settled ones are 'verified' and 'not_verified'. The
 * two sets differ -- a session is terminal at 'failed'/'expired' while its
 * display form is 'not_verified' -- so they are named separately to stop the
 * two being confused at a call site.
 */
export function isTerminalSessionStatus(status: KycSessionStatus): boolean {
  return status === 'verified' || status === 'failed' || status === 'expired';
}

/** 'pending' is the only unresolved DISPLAY status, so it is the only non-terminal one. */
export function isUnresolvedDisplayStatus(status: DisplayStatus): boolean {
  return status === 'pending';
}

/** Narrow an untrusted row value to a known session status. */
export function sanitizeSessionStatus(value: unknown): KycSessionStatus | null {
  return typeof value === 'string' && (SESSION_STATUSES as readonly string[]).includes(value)
    ? (value as KycSessionStatus)
    : null;
}

/**
 * Collapse one document's sessions into a single state.
 *
 * Precedence is verified first because it is sticky: apply_kyc_outcome refuses
 * to let a later expiry undo a verification, so an older verified session must
 * keep winning over a newer failure.
 */
function rank(status: KycSessionStatus): number {
  switch (status) {
    case 'verified':
      return 4;
    case 'pending':
      return 3;
    case 'failed':
      return 2;
    case 'expired':
      return 1;
    default:
      return 0;
  }
}

/**
 * One entry per document, strongest state wins.
 *
 * Any row we cannot make sense of is skipped rather than allowed to influence
 * the result, so a malformed row cannot manufacture a 'verified'.
 */
export function buildDocumentStatuses(
  rows: ReadonlyArray<{ doc_type?: unknown; status?: unknown }>,
): DocumentStatus[] {
  const best = new Map<DocType, KycSessionStatus>();
  for (const row of rows) {
    const type = typeof row?.doc_type === 'string' && DOC_TYPE_SET.has(row.doc_type)
      ? (row.doc_type as DocType)
      : null;
    const status = sanitizeSessionStatus(row?.status);
    if (!type || !status) continue;
    const current = best.get(type);
    if (!current || rank(status) > rank(current)) best.set(type, status);
  }

  const documents: DocumentStatus[] = [];
  for (const type of ['aadhaar', 'pan', 'dl'] as DocType[]) {
    const status = best.get(type);
    if (status) documents.push({ type, status });
  }
  return documents;
}

/**
 * Overall status for the profile screen.
 *
 * 'expired' surfaces as 'not_verified' because an expired link is not a verdict
 * on the rider: it only means the journey was abandoned and can be restarted.
 * Reporting it as anything stronger would be a claim the data does not support.
 */
export function toDisplayStatus(status: KycSessionStatus): DisplayStatus {
  if (status === 'verified') return 'verified';
  if (status === 'pending') return 'pending';
  return 'not_verified';
}

/** Aggregate across documents; verified anywhere wins. */
export function aggregateDisplayStatus(documents: readonly DocumentStatus[]): DisplayStatus {
  if (documents.some((d) => d.status === 'verified')) return 'verified';
  if (documents.some((d) => d.status === 'pending')) return 'pending';
  return 'not_verified';
}

/**
 * Build the response.
 *
 * Deliberately narrow. It carries no user id, no verification_id, no form link,
 * and nothing from the Cashfree payload (which contains the rider's name,
 * phone and email). The client needs an overall state and, per document, which
 * state it is in -- that is all.
 */
export function buildStatusResponse(
  rows: ReadonlyArray<{ doc_type?: unknown; status?: unknown }>,
  serverTime: string,
): KycStatusResponse {
  const documents = buildDocumentStatuses(rows);
  const verified = documents.find((d) => d.status === 'verified');
  return {
    status: aggregateDisplayStatus(documents),
    verifiedDocument: verified?.type ?? null,
    documents,
    serverTime,
  };
}

/**
 * Extract the bearer token.
 *
 * Returns null for a missing or malformed header so the caller can answer 401.
 * A bare token with no scheme is rejected rather than guessed at: accepting it
 * would mean treating arbitrary header content as a credential.
 */
export function bearerToken(authorization: string | null | undefined): string | null {
  if (!authorization) return null;
  const trimmed = authorization.trim();
  if (trimmed.length === 0) return null;
  if (!/^bearer\s+/i.test(trimmed)) return null;
  const token = trimmed.replace(/^bearer\s+/i, '').trim();
  return token.length > 0 ? token : null;
}