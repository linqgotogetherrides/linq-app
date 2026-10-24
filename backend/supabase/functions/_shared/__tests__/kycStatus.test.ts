import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateDisplayStatus,
  bearerToken,
  buildDocumentStatuses,
  buildStatusResponse,
  isTerminalSessionStatus,
  isUnresolvedDisplayStatus,
  sanitizeSessionStatus,
  toDisplayStatus,
} from '../kycStatus.ts';

const row = (doc_type: string, status: string) => ({ doc_type, status });

describe('bearer token extraction', () => {
  test('accepts a well formed bearer header', () => {
    assert.equal(bearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
    assert.equal(bearerToken('bearer abc'), 'abc');
    assert.equal(bearerToken('BEARER   abc  '), 'abc');
  });

  test('refuses anything that is not a bearer header', () => {
    // A bare token with no scheme is refused rather than guessed at, so
    // arbitrary header content is never treated as a credential.
    for (const bad of ['', '   ', 'abc.def', 'Basic abc', 'Token abc', 'Bearer', null, undefined]) {
      assert.equal(bearerToken(bad as string), null, `${JSON.stringify(bad)} must be refused`);
    }
  });
});

describe('session status sanitising', () => {
  test('accepts the four documented column values', () => {
    for (const s of ['pending', 'verified', 'failed', 'expired']) {
      assert.equal(sanitizeSessionStatus(s), s);
    }
  });

  test('rejects anything outside the CHECK constraint', () => {
    for (const bad of ['VERIFIED', 'ok', '', null, undefined, 1, {}, 'received', 'success']) {
      assert.equal(sanitizeSessionStatus(bad), null, `${JSON.stringify(bad)} must be refused`);
    }
  });
});

describe('document status rollup', () => {
  test('collapses repeated sessions for one document', () => {
    const docs = buildDocumentStatuses([
      row('pan', 'expired'),
      row('pan', 'pending'),
      row('pan', 'expired'),
    ]);
    assert.deepEqual(docs, [{ type: 'pan', status: 'pending' }]);
  });

  test('verified outranks a newer pending or failed session', () => {
    // apply_kyc_outcome refuses to let a later expiry undo a verification, so
    // the rollup must not either.
    assert.deepEqual(buildDocumentStatuses([row('aadhaar', 'pending'), row('aadhaar', 'verified')]), [
      { type: 'aadhaar', status: 'verified' },
    ]);
    assert.deepEqual(buildDocumentStatuses([row('aadhaar', 'verified'), row('aadhaar', 'failed')]), [
      { type: 'aadhaar', status: 'verified' },
    ]);
  });

  test('ignores malformed rows instead of letting them decide', () => {
    assert.deepEqual(
      buildDocumentStatuses([
        row('passport', 'verified'),
        row('pan', 'SUCCESS'),
        { doc_type: 'dl', status: 5 },
        null as never,
        row('pan', 'pending'),
      ]),
      [{ type: 'pan', status: 'pending' }],
    );
  });

  test('returns a stable document order', () => {
    assert.deepEqual(
      buildDocumentStatuses([row('dl', 'pending'), row('aadhaar', 'verified'), row('pan', 'expired')]),
      [
        { type: 'aadhaar', status: 'verified' },
        { type: 'pan', status: 'expired' },
        { type: 'dl', status: 'pending' },
      ],
    );
  });

  test('handles no rows at all', () => {
    assert.deepEqual(buildDocumentStatuses([]), []);
  });
});

describe('display status', () => {
  test('expired and failed both read as not_verified', () => {
    // An abandoned link is not a verdict on the rider; they can retry.
    assert.equal(toDisplayStatus('expired'), 'not_verified');
    assert.equal(toDisplayStatus('failed'), 'not_verified');
  });

  test('pending and verified pass through', () => {
    assert.equal(toDisplayStatus('pending'), 'pending');
    assert.equal(toDisplayStatus('verified'), 'verified');
  });

  test('aggregate is verified if any document is', () => {
    assert.equal(
      aggregateDisplayStatus([
        { type: 'pan', status: 'pending' },
        { type: 'aadhaar', status: 'verified' },
      ]),
      'verified',
    );
  });

  test('aggregate is pending if any document is pending and none verified', () => {
    assert.equal(
      aggregateDisplayStatus([
        { type: 'pan', status: 'expired' },
        { type: 'aadhaar', status: 'pending' },
      ]),
      'pending',
    );
  });

  test('aggregate with nothing usable is not_verified', () => {
    assert.equal(aggregateDisplayStatus([]), 'not_verified');
  });

  test('session-level terminality is about trusted outcomes, not display', () => {
    // 'failed' and 'expired' settle a session even though they display as
    // not_verified, which is why this is a different question from the
    // frontend's polling gate.
    assert.equal(isTerminalSessionStatus('verified'), true);
    assert.equal(isTerminalSessionStatus('failed'), true);
    assert.equal(isTerminalSessionStatus('expired'), true);
    assert.equal(isTerminalSessionStatus('pending'), false);
  });

  test('pending is the only unresolved display status', () => {
    assert.equal(isUnresolvedDisplayStatus('pending'), true);
    assert.equal(isUnresolvedDisplayStatus('verified'), false);
    assert.equal(isUnresolvedDisplayStatus('not_verified'), false);
  });
});

describe('response shape', () => {
  test('reports the verified document', () => {
    const res = buildStatusResponse([row('pan', 'pending'), row('dl', 'verified')], '2026-10-15T00:00:00Z');
    assert.equal(res.status, 'verified');
    assert.equal(res.verifiedDocument, 'dl');
    assert.equal(res.serverTime, '2026-10-15T00:00:00Z');
  });

  test('verifiedDocument is null when nothing is verified', () => {
    const res = buildStatusResponse([row('pan', 'pending')], '2026-10-15T00:00:00Z');
    assert.equal(res.verifiedDocument, null);
  });

  test('a rider with no sessions is not_verified, never pending', () => {
    const res = buildStatusResponse([], '2026-10-15T00:00:00Z');
    assert.equal(res.status, 'not_verified');
    assert.deepEqual(res.documents, []);
  });

  test('carries no identifier the client could reuse to reach another rider', () => {
    const res = buildStatusResponse([row('pan', 'verified')], '2026-10-15T00:00:00Z');
    const keys = Object.keys(res).sort();
    assert.deepEqual(keys, ['documents', 'serverTime', 'status', 'verifiedDocument']);
    // No user id, no verification_id, no form_link, no name/phone/email.
    for (const forbidden of ['userId', 'user_id', 'verificationId', 'verification_id', 'formLink', 'phone', 'email', 'name']) {
      assert.ok(!(forbidden in res), `response must not carry ${forbidden}`);
    }
  });

  test('garbage rows cannot manufacture a verified', () => {
    const res = buildStatusResponse(
      [{ doc_type: 'pan', status: 'SUCCESS' }, { doc_type: 'x', status: 'verified' }],
      '2026-10-15T00:00:00Z',
    );
    assert.equal(res.status, 'not_verified');
    assert.equal(res.verifiedDocument, null);
  });
});