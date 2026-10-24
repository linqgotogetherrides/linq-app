/**
 * Pure logic for what each document option on the verification selection
 * screens does when tapped.
 *
 * Kept free of React, navigation and Supabase so both selection pages
 * (`app/verification.tsx` and `app/verification-profile.tsx`) route through
 * exactly one tested decision function instead of each hand-wiring its own
 * behaviour.
 *
 * WHY AADHAAR AND DRIVING LICENCE ARE GATED
 *   Only PAN verification is offered today. The gated methods must never
 *   start a Cashfree session or even imply availability: `create-kyc-session`
 *   can produce a session for any configured document type, so simply not
 *   sending a request is the only honest control. Aadhaar and driving licence
 *   therefore resolve to an explicit "currently unavailable" action, and PAN
 *   resolves to the dedicated page that runs the real flow.
 *
 * The strings here are single-sourced so tests and UI agree verbatim. Testing
 * intent (`testID`s) stays in the components.
 */

/** Dedicated page that hosts the PAN verification flow. */
export const PAN_PAGE_ROUTE = '/pan-verification';

/** Where the success panel returns when there is no history to pop. */
export const HOME_ROUTE = '/(tabs)/home';

/** Documents that are gated behind the "currently unavailable" flow. */
export type UnavailableDocType = 'aadhaar' | 'dl';

/** What a tap on one of the three options should do. */
export type VerificationOptionAction =
  | { type: 'open_pan_page' }
  | { type: 'show_unavailable'; docType: UnavailableDocType };

/** Required copy: the unavailable method's single explanation line. */
export const AADHAAR_DL_UNAVAILABLE_MESSAGE =
  'This verification method is currently unavailable. You can verify your account using PAN instead.';

/** Required action labels on the unavailable sheet. */
export const VERIFY_WITH_PAN_LABEL = 'Verify with PAN';
export const SKIP_FOR_NOW_LABEL = 'Skip for now';

/** Their display names, for building a title per document. */
const UNAVAILABLE_LABELS: Record<UnavailableDocType, string> = {
  aadhaar: 'Aadhaar',
  dl: 'Driving Licence',
};

/**
 * The one decision both selection screens share.
 *
 * Unknown keys resolve to `null` so a caller never falls back to something
 * that would silently start an ad-hoc session for a mistyped document name.
 */
export function actionForDocument(docType: string): VerificationOptionAction | null {
  if (docType === 'pan') return { type: 'open_pan_page' };
  if (docType === 'aadhaar' || docType === 'dl') {
    return { type: 'show_unavailable', docType };
  }
  return null;
}

/** Expected title of the unavailable sheet, per gated document. */
export function documentUnavailableTitle(docType: UnavailableDocType): string {
  return `${UNAVAILABLE_LABELS[docType]} verification unavailable`;
}
