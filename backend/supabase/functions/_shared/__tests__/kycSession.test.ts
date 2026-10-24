import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  CASHFREE_DEFAULT_TEMPLATE,
  DOC_TYPES,
  KycConfigError,
  MAX_VERIFICATION_ID_LENGTH,
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
} from '../kycSession.ts';

// Throwaway values. Never real credentials, never printed.
const ENV_OK = {
  CASHFREE_APP_ID: 'test-client-id',
  CASHFREE_SECRET_KEY: 'test-secret',
  CASHFREE_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\nnot-a-real-key\n-----END PUBLIC KEY-----',
};

describe('document type allowlist', () => {
  test('accepts exactly the three supported types', () => {
    assert.equal(sanitizeDocType('aadhaar'), 'aadhaar');
    assert.equal(sanitizeDocType('pan'), 'pan');
    assert.equal(sanitizeDocType('dl'), 'dl');
  });

  test('normalises case and whitespace', () => {
    assert.equal(sanitizeDocType('  PAN '), 'pan');
    assert.equal(sanitizeDocType('Aadhaar'), 'aadhaar');
  });

  test('rejects anything else, including near-misses', () => {
    for (const bad of ['passport', 'voter_id', 'dl2', '', 'aadhaar;drop', null, undefined, 42, {}, ['pan']]) {
      assert.equal(sanitizeDocType(bad), null, `${JSON.stringify(bad)} must be rejected`);
    }
  });

  test('the allowlist has not grown by accident', () => {
    assert.deepEqual([...DOC_TYPES], ['aadhaar', 'pan', 'dl']);
  });
});

describe('environment validation', () => {
  test('accepts a complete configuration', () => {
    const cfg = resolveCashfreeConfig(ENV_OK);
    assert.equal(cfg.clientId, 'test-client-id');
    assert.equal(cfg.isProd, false);
    assert.equal(cfg.baseUrl, 'https://sandbox.cashfree.com/verification');
  });

  test('routes to production only when explicitly asked', () => {
    const cfg = resolveCashfreeConfig({ ...ENV_OK, CASHFREE_ENVIRONMENT: 'production' });
    assert.equal(cfg.isProd, true);
    assert.equal(cfg.baseUrl, 'https://api.cashfree.com/verification');
  });

  test('anything other than "production" stays on sandbox', () => {
    for (const v of ['sandbox', 'test', 'prod', '', 'PRODUCTION ']) {
      const expected = v.trim().toLowerCase() === 'production';
      assert.equal(resolveCashfreeConfig({ ...ENV_OK, CASHFREE_ENVIRONMENT: v }).isProd, expected);
    }
  });

  test('refuses to run without credentials', () => {
    const cases: [keyof typeof ENV_OK, string][] = [
      ['CASHFREE_APP_ID', 'cashfree_app_id_missing'],
      ['CASHFREE_SECRET_KEY', 'cashfree_secret_key_missing'],
      ['CASHFREE_PUBLIC_KEY', 'cashfree_public_key_missing'],
    ];
    for (const [key, reason] of cases) {
      const env: Record<string, string> = { ...ENV_OK };
      delete env[key];
      assert.throws(
        () => resolveCashfreeConfig(env),
        (e: unknown) => e instanceof KycConfigError && e.reason === reason,
        `${key} missing must report ${reason}`,
      );
    }
  });

  test('treats whitespace-only values as missing', () => {
    assert.throws(
      () => resolveCashfreeConfig({ ...ENV_OK, CASHFREE_APP_ID: '   ' }),
      (e: unknown) => e instanceof KycConfigError && e.reason === 'cashfree_app_id_missing',
    );
  });
});

describe('template resolution', () => {
  test('aadhaar falls back to the one documented Cashfree default', () => {
    assert.equal(resolveTemplateByDocType('aadhaar', {}), CASHFREE_DEFAULT_TEMPLATE);
    assert.equal(resolveTemplateByDocType('aadhaar', {}), 'Aadhaar_verification');
  });

  test('aadhaar can still be overridden', () => {
    assert.equal(
      resolveTemplateByDocType('aadhaar', { CASHFREE_TEMPLATE_AADHAAR: 'custom_aadhaar' }),
      'custom_aadhaar',
    );
  });

  test('PAN and DL have NO invented default and must be configured', () => {
    // This is the regression guard for the most likely cause of the original
    // 400: "PAN_verification" / "Driving_License_verification" were never
    // documented by Cashfree and appear nowhere in this project.
    assert.throws(
      () => resolveTemplateByDocType('pan', {}),
      (e: unknown) => e instanceof KycConfigError && e.reason === 'template_not_configured',
    );
    assert.throws(
      () => resolveTemplateByDocType('dl', {}),
      (e: unknown) => e instanceof KycConfigError && e.reason === 'template_not_configured',
    );
  });

  test('configured PAN and DL names are used verbatim', () => {
    assert.equal(
      resolveTemplateByDocType('pan', { CASHFREE_TEMPLATE_PAN: 'my_pan_template' }),
      'my_pan_template',
    );
    assert.equal(
      resolveTemplateByDocType('dl', { CASHFREE_TEMPLATE_DL: 'my_dl_template' }),
      'my_dl_template',
    );
  });
});

describe('verification id', () => {
  test('is accepted by the documented constraints', () => {
    for (let i = 0; i < 200; i += 1) {
      const id = newVerificationId();
      assert.ok(isAcceptableVerificationId(id), `${id} must be acceptable`);
    }
  });

  test('contains no character Cashfree could treat as special', () => {
    for (let i = 0; i < 200; i += 1) {
      const id = newVerificationId();
      assert.match(id, /^[a-z0-9]+$/);
      assert.ok(!id.includes('_'), 'underscores were the old id\'s risk');
      assert.ok(!id.includes('-'), 'hyphens are unnecessary');
    }
  });

  test('fits inside the 50 character cap', () => {
    assert.ok(newVerificationId().length <= MAX_VERIFICATION_ID_LENGTH);
  });

  test('does not leak a rider identifier', () => {
    // The old format was v_<uid>_<doc>_<ts>; the new one is opaque, so no uid
    // fragment can appear in a provider log or a webhook echo.
    const id = newVerificationId();
    assert.ok(!id.startsWith('v_'));
    assert.ok(!id.includes('u1'));
  });

  test('does not repeat', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newVerificationId()));
    assert.equal(ids.size, 500);
  });

  test('rejects an id carrying a special character', () => {
    assert.equal(isAcceptableVerificationId('v_uid_a_123'), false);
    assert.equal(isAcceptableVerificationId('a'.repeat(51)), false);
    assert.equal(isAcceptableVerificationId(''), false);
    assert.equal(isAcceptableVerificationId('abc123'), true);
  });
});

describe('phone normalisation', () => {
  test('accepts a clean ten digit number', () => {
    assert.equal(normalizeIndianPhone('9876543210'), '9876543210');
  });

  test('strips formatting and an explicit +91 country code', () => {
    assert.equal(normalizeIndianPhone('+91 98765 43210'), '9876543210');
    assert.equal(normalizeIndianPhone('919876543210'), '9876543210');
    assert.equal(normalizeIndianPhone('98-765-432-10'), '9876543210');
  });

  test('refuses anything that is not ten digits', () => {
    for (const bad of [
      '', '12345', '123456789', '1234567890123', null, undefined, 'not a number',
      // A leading 91 is only stripped from a full 12-digit number, never
      // invented by discarding the tail of a longer one.
      '9123456789012',
    ]) {
      assert.equal(normalizeIndianPhone(bad as string), null, `${bad} must be refused`);
    }
  });
});

describe('name sanitisation', () => {
  test('keeps a name Cashfree will accept', () => {
    assert.equal(sanitizeCashfreeName('John Doe'), 'John Doe');
    assert.equal(sanitizeCashfreeName("O'Brien"), 'O Brien');
    assert.equal(sanitizeCashfreeName('Dr. Ana-Maria 2'), 'Dr. Ana-Maria 2');
  });

  test('returns null rather than sending an empty optional field', () => {
    assert.equal(sanitizeCashfreeName(''), null);
    assert.equal(sanitizeCashfreeName('   '), null);
    assert.equal(sanitizeCashfreeName('•••'), null);
    assert.equal(sanitizeCashfreeName(null), null);
    assert.equal(sanitizeCashfreeName(undefined), null);
  });

  test('produces no character outside the documented set', () => {
    const out = sanitizeCashfreeName('राहुल O\'Brien (jr.) #42') ?? '';
    assert.match(out, /^[A-Za-z0-9 .-]*$/);
  });
});

describe('link expiry', () => {
  test('is the documented YYYY-MM-DD shape, within 30 days', () => {
    const value = linkExpiryDate(new Date('2026-10-15T00:00:00.000Z'));
    assert.match(value, /^\d{4}-\d{2}-\d{2}$/);
    const days = (Date.parse(`${value}T00:00:00Z`) - Date.parse('2026-10-15T00:00:00Z')) / 86400000;
    assert.equal(days, 7);
    assert.ok(days <= 30);
  });
});

describe('session decision from Cashfree status', () => {
  test('reuses a live form', () => {
    for (const s of ['RECEIVED', 'PENDING', 'SUCCESS', 'received', 'pending']) {
      assert.equal(decideSessionAction(s), 'reuse', `${s} should reuse`);
    }
  });

  test('supersedes an expired link', () => {
    assert.equal(decideSessionAction('EXPIRED'), 'supersede');
    assert.equal(decideSessionAction('expired'), 'supersede');
  });

  test('supersedes when Cashfree tells us nothing', () => {
    for (const s of [null, undefined, '']) {
      assert.equal(decideSessionAction(s), 'supersede');
    }
  });
});

describe('provider response parsing', () => {
  test('reads form_link and reference_id', () => {
    const parsed = readFormLink({ form_link: 'https://forms.cashfree.com/x', reference_id: 235461 });
    assert.equal(parsed?.formLink, 'https://forms.cashfree.com/x');
    assert.equal(parsed?.referenceId, 235461);
  });

  test('tolerates a missing reference_id', () => {
    assert.equal(readFormLink({ form_link: 'https://x' })?.referenceId, null);
  });

  test('refuses a response with no usable link', () => {
    for (const bad of [null, undefined, {}, 'string', 42, { form_link: '' }, { form_link: 5 }]) {
      assert.equal(readFormLink(bad), null);
    }
  });
});