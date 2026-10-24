import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  NAME_MAX_LENGTH,
  PAN_EXAMPLE,
  PAN_FORMAT_PATTERN,
  PAN_FORMAT_HINT,
  PAN_MAX_LENGTH,
  canBeginVerification,
  isValidPanFormat,
  nameMatchesProfileNote,
  normalizePanInput,
  validatePanEntry,
} from '../panForm.ts';

describe('PAN format', () => {
  test('accepts the documented 5-4-1 shape', () => {
    assert.equal(isValidPanFormat(PAN_EXAMPLE), true);
    assert.equal(isValidPanFormat('ABCPF1234F'), true);
  });

  test('rejects each broken shape', () => {
    // 4 letters only
    assert.equal(isValidPanFormat('ABCD12345'), false);
    // digits where letters belong
    assert.equal(isValidPanFormat('123456789A'), false);
    // digit in the last position
    assert.equal(isValidPanFormat('ABCDE12341'), false);
    // letter in digit positions
    assert.equal(isValidPanFormat('ABCDEA234F'), false);
    // wrong length
    assert.equal(isValidPanFormat('ABCDE1234'), false);
    assert.equal(isValidPanFormat(''), false);
  });

  test('normalisation precedes validation everywhere', () => {
    assert.equal(isValidPanFormat(normalizePanInput('abcde1234f')), true);
    assert.equal(isValidPanFormat(normalizePanInput(' ABCDE 1234F ')), true);
    // Overlong input is capped at the documented length...
    assert.equal(normalizePanInput('ABCDE12345F').length, PAN_MAX_LENGTH);
    // ...so the pattern can no longer be evaded by suffix junk. The prototype
    // caps its input the same way; a ninth digit is a wrong PAN, not a pass.
    assert.equal(isValidPanFormat(normalizePanInput('ABCDE12345F')), false);
  });

  test('normalisation preserves the documented limits and is idempotent', () => {
    assert.equal(normalizePanInput('abcde f'), 'ABCDEF');
    assert.equal(normalizePanInput(normalizePanInput('a b c')), normalizePanInput('ABC'));
    assert.equal(PAN_FORMAT_PATTERN.source, '^[A-Z]{5}[0-9]{4}[A-Z]$');
  });
});

describe('submit gating (validation order mirrors the prototype)', () => {
  test('missing consent blocks first', () => {
    const outcome = validatePanEntry({ name: 'Anjana R', pan: PAN_EXAMPLE, consent: false });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.field, 'consent');
    assert.match(outcome.error!, /consent/i);
  });

  test('a malformed PAN blocks before the name is ever considered', () => {
    const outcome = validatePanEntry({ name: 'Anjana R', pan: 'ABCDE1234', consent: true });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.field, 'pan');
  });

  test('a missing name blocks', () => {
    const outcome = validatePanEntry({ name: '   ', pan: PAN_EXAMPLE, consent: true });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.field, 'name');
  });

  test('a name over the prototype limit blocks', () => {
    const outcome = validatePanEntry({ name: 'x'.repeat(NAME_MAX_LENGTH + 1), pan: PAN_EXAMPLE, consent: true });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.field, 'name');
  });

  test('a complete entry passes', () => {
    const outcome = validatePanEntry({ name: 'Anjana R', pan: 'ABCDE1234F', consent: true });
    assert.deepEqual(outcome, { ok: true, field: null, error: null });
  });
});

describe('duplicate-submission guard', () => {
  test('no second submission while one is in flight', () => {
    assert.equal(canBeginVerification({ busy: true }), false);
    assert.equal(canBeginVerification({ busy: false }), true);
  });
});

describe('profile-name note', () => {
  test('no note when the names agree', () => {
    assert.equal(nameMatchesProfileNote('Anjana R', 'Anjana R'), null);
    assert.equal(nameMatchesProfileNote('  Anjana   R ', 'anjana r'), null);
  });

  test('a mismatch warns before a provider-side rejection can surprise', () => {
    const note = nameMatchesProfileNote('Anjana', 'Anjana Reddy');
    assert.match(note!, /profile/i);
  });

  test('an empty side is not a mismatch', () => {
    assert.equal(nameMatchesProfileNote('Anjana', ''), null);
    assert.equal(nameMatchesProfileNote('', 'Anjana'), null);
  });
});

describe('surface copy', () => {
  test('the helper line stays the documented text', () => {
    assert.equal(PAN_FORMAT_HINT, 'Format: 5 letters, 4 numbers, then 1 letter.');
    assert.equal(PAN_EXAMPLE, 'ABCDE1234F');
  });
});
