import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  KYC_LINK_ACTION_PERFORMED,
  KYC_LINK_EXPIRED,
  KYC_LINK_SUCCESS,
  TERMINAL_OUTCOMES,
  classifyKycEvent,
  computeWebhookSignature,
  constantTimeEqual,
  verifyCashfreeSignature,
} from '../cashfreeWebhook.ts';

// A throwaway value. Never a real credential, and never printed.
const SECRET = 'test-only-client-secret';

/** Builds a payload in the documented KYC Links shape. */
function payload(eventType: string, formStatus: string, verificationId = 'v_test_123') {
  return {
    signature: 'irrelevant-for-this-algorithm',
    event_type: eventType,
    event_time: '2026-02-15 16:53:15',
    version: 'v1',
    data: {
      name: 'Test',
      phone: '9999999999',
      verification_id: verificationId,
      reference_id: 235461,
      form_status: formStatus,
      verification_details: [
        { reference_id: 234, type: 'PANDETAILS_VERIFICATION', status: formStatus },
      ],
    },
  };
}

const validBody = JSON.stringify(payload(KYC_LINK_SUCCESS, 'SUCCESS'));

async function verify(overrides: Partial<Parameters<typeof verifyCashfreeSignature>[0]> = {}) {
  const timestamp = '1743123456789';
  return verifyCashfreeSignature({
    secret: SECRET,
    timestamp,
    rawBody: validBody,
    receivedSignature: await computeWebhookSignature(SECRET, timestamp, validBody),
    ...overrides,
  });
}

describe('signature verification', () => {
  test('accepts a correctly signed body', async () => {
    assert.equal(await verify(), true);
  });

  test('rejects a missing signature header', async () => {
    assert.equal(await verify({ receivedSignature: null }), false);
  });

  test('rejects a missing timestamp header', async () => {
    assert.equal(await verify({ timestamp: null }), false);
  });

  test('rejects an unconfigured client secret', async () => {
    assert.equal(await verify({ secret: null }), false);
    assert.equal(await verify({ secret: '' }), false);
  });

  test('rejects a forged signature', async () => {
    const forged = Buffer.from('forged-signature-value').toString('base64');
    assert.equal(await verify({ receivedSignature: forged }), false);
  });

  test('rejects a body edited after signing', async () => {
    // Same signature, tampered payload: the HMAC no longer matches.
    const tampered = JSON.stringify(payload(KYC_LINK_SUCCESS, 'SUCCESS', 'v_other_999'));
    assert.equal(await verify({ rawBody: tampered }), false);
  });

  test('rejects a payload whose verification_id was swapped for a victim', async () => {
    // This is the exploit the old handler fell to: a valid Cashfree signature is
    // unobtainable without the secret, so forging one fails closed.
    const timestamp = '1743123456789';
    const victim = JSON.stringify(payload(KYC_LINK_SUCCESS, 'SUCCESS', 'v_victim_uid_a_1'));
    const signature = await computeWebhookSignature(SECRET, timestamp, victim);
    assert.equal(
      await verifyCashfreeSignature({
        secret: SECRET,
        timestamp,
        rawBody: validBody,
        receivedSignature: signature,
      }),
      false,
    );
  });

  test('rejects a signature made with the wrong secret', async () => {
    const timestamp = '1743123456789';
    const signature = await computeWebhookSignature('a-different-secret', timestamp, validBody);
    assert.equal(await verify({ receivedSignature: signature }), false);
  });

  test('constant-time compare agrees with equality semantics', () => {
    assert.equal(constantTimeEqual('abc', 'abc'), true);
    assert.equal(constantTimeEqual('abc', 'abd'), false);
    assert.equal(constantTimeEqual('abc', 'abcd'), false);
    assert.equal(constantTimeEqual('', ''), true);
  });
});

describe('event classification', () => {
  test('KYC_LINK_SUCCESS with form_status SUCCESS is terminal and verified', () => {
    const result = classifyKycEvent(payload(KYC_LINK_SUCCESS, 'SUCCESS'));
    assert.equal(result.outcome, 'verified');
    assert.equal(result.verificationId, 'v_test_123');
    assert.equal(result.referenceId, 235461);
    assert.ok(TERMINAL_OUTCOMES.has(result.outcome));
  });

  test('KYC_LINK_EXPIRED is terminal but never verifies', () => {
    const result = classifyKycEvent(payload(KYC_LINK_EXPIRED, 'EXPIRED'));
    assert.equal(result.outcome, 'expired');
    assert.ok(TERMINAL_OUTCOMES.has(result.outcome));
    assert.notEqual(result.outcome, 'verified');
  });

  test('KYC_LINK_ACTION_PERFORMED is not terminal', () => {
    const result = classifyKycEvent(payload(KYC_LINK_ACTION_PERFORMED, 'SUCCESS'));
    assert.equal(result.outcome, 'in_progress');
    assert.ok(!TERMINAL_OUTCOMES.has(result.outcome));
  });

  test('a success event carrying the wrong form_status is ignored', () => {
    // event_type alone must not be enough to grant verification.
    const result = classifyKycEvent(payload(KYC_LINK_SUCCESS, 'RECEIVED'));
    assert.equal(result.outcome, 'ignored');
  });

  test('a success form_status under a non-success event is ignored', () => {
    const result = classifyKycEvent(payload(KYC_LINK_ACTION_PERFORMED, 'SUCCESS'));
    assert.equal(result.outcome, 'in_progress');
    assert.notEqual(result.outcome, 'verified');
  });

  test('an unknown event type is ignored', () => {
    const result = classifyKycEvent(payload('KYC_LINK_SOMETHING_NEW', 'SUCCESS'));
    assert.equal(result.outcome, 'ignored');
  });

  test('malformed payloads are ignored rather than throwing', () => {
    for (const bad of [null, undefined, 42, 'string', {}, { data: null }, { event_type: 'X' }]) {
      assert.equal(classifyKycEvent(bad).outcome, 'ignored');
    }
  });

  test('a missing verification_id is ignored', () => {
    const broken = payload(KYC_LINK_SUCCESS, 'SUCCESS');
    delete (broken.data as any).verification_id;
    const result = classifyKycEvent(broken);
    assert.equal(result.outcome, 'ignored');
    assert.equal(result.verificationId, null);
  });

  test('does not read data.status, which KYC Links payloads do not carry', () => {
    // The old handler read data.status, so it never matched and nobody was ever
    // verified. Lock that regression shut.
    const p = payload(KYC_LINK_SUCCESS, 'SUCCESS') as any;
    p.data.status = 'SUCCESS';
    delete p.data.form_status;
    assert.equal(classifyKycEvent(p).outcome, 'ignored');
  });
});

describe('duplicate delivery', () => {
  test('classifying the same delivery twice yields the same outcome', () => {
    const body = payload(KYC_LINK_SUCCESS, 'SUCCESS');
    const first = classifyKycEvent(JSON.parse(JSON.stringify(body)));
    const second = classifyKycEvent(JSON.parse(JSON.stringify(body)));
    assert.deepEqual(first, second);
  });

  test('the signature of a repeated body is stable', async () => {
    const timestamp = '1743123456789';
    const a = await computeWebhookSignature(SECRET, timestamp, validBody);
    const b = await computeWebhookSignature(SECRET, timestamp, validBody);
    assert.equal(a, b);
  });
});