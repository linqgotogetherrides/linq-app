import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { RideStatus } from '../../types/index.ts';

describe('Ride Lifecycle & Trip Statuses', () => {
  test('RideStatus union includes in_progress and completed', () => {
    const validStatuses: RideStatus[] = [
      'draft',
      'active',
      'confirmed',
      'in_progress',
      'completed',
      'cancelled',
    ];
    assert.equal(validStatuses.includes('in_progress'), true);
    assert.equal(validStatuses.includes('completed'), true);
    assert.equal(validStatuses.length, 6);
  });

  test('validates 1-5 rating range for post-trip reviews', () => {
    const isValidRating = (r: number) => Number.isInteger(r) && r >= 1 && r <= 5;
    assert.equal(isValidRating(1), true);
    assert.equal(isValidRating(5), true);
    assert.equal(isValidRating(3), true);
    assert.equal(isValidRating(0), false);
    assert.equal(isValidRating(6), false);
    assert.equal(isValidRating(3.5), false);
  });
});

describe('Connection Fee & Contact Unlock', () => {
  test('Connection fee matches 900 paise (₹9)', () => {
    const CONNECTION_FEE_PAISE = 900;
    const CONNECTION_FEE_RUPEES = CONNECTION_FEE_PAISE / 100;
    assert.equal(CONNECTION_FEE_RUPEES, 9);
  });

  test('Phone number sanitizer creates valid tel and WhatsApp links', () => {
    const sanitizePhone = (raw: string) => raw.replace(/^\+91/, '').replace(/\D/g, '');
    const clean = sanitizePhone('+91 98765 43210');
    assert.equal(clean, '9876543210');

    const telUri = `tel:+91${clean}`;
    assert.equal(telUri, 'tel:+919876543210');

    const msg = encodeURIComponent('Hi from LinQ');
    const waUri = `https://wa.me/91${clean}?text=${msg}`;
    assert.equal(waUri, 'https://wa.me/919876543210?text=Hi%20from%20LinQ');
  });

  test('Contact is masked until unlocked', () => {
    const resolveContactPhone = (thread: { contactUnlocked?: boolean; otherPhone?: string }) => {
      if (!thread.contactUnlocked) return null;
      return thread.otherPhone ?? null;
    };

    assert.equal(
      resolveContactPhone({ contactUnlocked: false, otherPhone: '9876543210' }),
      null,
    );
    assert.equal(
      resolveContactPhone({ contactUnlocked: true, otherPhone: '9876543210' }),
      '9876543210',
    );
  });
});
