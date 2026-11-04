import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSosMessage,
  buildSosWhatsAppUrl,
  normalizeSosPhone,
} from '../../services/sos/sosMessage.ts';

const profile = {
  userName: 'Asha',
  contactName: 'Ravi',
  contactPhone: '9876543210',
};

const location = { latitude: 12.9716, longitude: 77.5946, accuracy: 18.4 };
const timestamp = '2026-11-04T07:15:00.000Z';

describe('WhatsApp phone normalization', () => {
  test('10 digit Indian numbers get the country code', () => {
    assert.equal(normalizeSosPhone('98765 43210'), '919876543210');
  });

  test('a leading zero is stripped before adding 91', () => {
    assert.equal(normalizeSosPhone('09876543210'), '919876543210');
  });

  test('already international numbers are preserved', () => {
    assert.equal(normalizeSosPhone('+91 98765 43210'), '919876543210');
    assert.equal(normalizeSosPhone('+1 (415) 555-2671'), '14155552671');
  });

  test('too-short numbers are rejected', () => {
    assert.equal(normalizeSosPhone('12345'), null);
    assert.equal(normalizeSosPhone(''), null);
  });
});

describe('SOS message', () => {
  test('names the user, contact, time and maps pin', () => {
    const message = buildSosMessage({ profile, location, timestamp });
    assert.match(message, /Asha needs help/);
    assert.match(message, /Hi Ravi/);
    assert.match(message, /2026/);
    assert.match(message, /query=12\.9716,77\.5946/);
    assert.match(message, /about 18 m/);
  });

  test('says location is unavailable instead of inventing one', () => {
    const message = buildSosMessage({ profile, location: null, timestamp });
    assert.match(message, /Location unavailable/);
    assert.doesNotMatch(message, /maps\.google/);
  });

  test('the URL targets the normalized contact and encodes the text', () => {
    const url = buildSosWhatsAppUrl({ profile, location, timestamp });
    assert.match(url, /^https:\/\/wa\.me\/919876543210\?text=/);
    assert.match(url, /Asha%20needs%20help/);
  });
});
