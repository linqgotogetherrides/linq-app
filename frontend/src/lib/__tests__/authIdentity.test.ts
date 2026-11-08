import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LEGACY_WEB_UID_PREFIX,
  isLegacyWebSession,
} from '../authIdentity.ts';

const here = dirname(fileURLToPath(import.meta.url));

describe('legacy web identities', () => {
  test('rejects every id minted by the retired phone stub', () => {
    assert.equal(LEGACY_WEB_UID_PREFIX, 'web-uid-');
    assert.equal(isLegacyWebSession('web-uid-+919876543210'), true);
    assert.equal(isLegacyWebSession('web-uid-9876543210'), true);
    assert.equal(isLegacyWebSession('web-uid-'), true);
  });

  test('accepts real Firebase and Supabase identities', () => {
    // Firebase phone-auth uids are opaque base-62 strings, not phone numbers.
    assert.equal(isLegacyWebSession('kR3nQ8pWv2a1XyZ4tU7mB6cD9eF0'), false);
    // Supabase OAuth users use UUIDs.
    assert.equal(isLegacyWebSession('f47ac10b-58cc-4372-a567-0e02b2c3d479'), false);
  });

  test('treats null and undefined as no session', () => {
    assert.equal(isLegacyWebSession(null), false);
    assert.equal(isLegacyWebSession(undefined), false);
    assert.equal(isLegacyWebSession(''), false);
  });

  test('web phone auth fails closed instead of minting an identity', () => {
    const source = readFileSync(join(here, '../auth.web.ts'), 'utf8');
    // The only acceptable web phone implementation throws.
    assert.match(source, /Phone sign-in is not available on the web/);
    // Guard against the old stub returning a ConfirmationResult that accepts
    // any code and encodes the phone number into the uid.
    assert.doesNotMatch(source, /confirm:\s*async/);
    assert.doesNotMatch(source, /web-uid-\$\{/);
  });
});
