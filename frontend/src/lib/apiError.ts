/**
 * Reader for the error body an Edge Function chose to send back.
 *
 * supabase-js wraps a non-2xx function response in a FunctionsHttpError whose
 * `context` carries the parsed body. The handler authors those bodies for
 * riders (`"Add a 10-digit phone number..."`, `"This document type is not
 * available yet."`), so surfacing them beats a generic failure.
 *
 * Deliberately returns `null` instead of the library's `.message`: the raw
 * message for these errors is transport noise ("Fetch failed",
 * "500 Internal Server Error"), not user copy.
 */
export interface FunctionErrorLike {
  context?: { error?: string };
  message?: string;
}

export function readFunctionError(error: unknown): string | null {
  const anyError = error as FunctionErrorLike | null;
  return anyError?.context?.error ?? null;
}
