import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  hasActivePlan,
  isPaidPlan,
  resolvePlan,
} from '../planAccess.ts';

const NOW = Date.parse('2026-11-08T12:00:00.000Z');
const FUTURE = '2027-11-08T12:00:00.000Z';
const PAST = '2026-11-07T12:00:00.000Z';

describe('paid plan resolution', () => {
  test('recognises only the two paid tiers', () => {
    assert.equal(isPaidPlan('yearly'), true);
    assert.equal(isPaidPlan('twoYear'), true);
    assert.equal(isPaidPlan('free'), false);
    assert.equal(isPaidPlan('two_year'), false);
    assert.equal(isPaidPlan(null), false);
  });

  test('keeps a paid plan only while its expiry is in the future', () => {
    assert.deepEqual(resolvePlan('yearly', FUTURE, NOW), {
      plan: 'yearly',
      planExpiresAt: FUTURE,
    });
    assert.deepEqual(resolvePlan('twoYear', FUTURE, NOW), {
      plan: 'twoYear',
      planExpiresAt: FUTURE,
    });
    assert.deepEqual(resolvePlan('yearly', PAST, NOW), { plan: 'free' });
  });

  test('fails closed on missing or malformed grants', () => {
    assert.deepEqual(resolvePlan(undefined, FUTURE, NOW), { plan: 'free' });
    assert.deepEqual(resolvePlan('yearly', undefined, NOW), { plan: 'free' });
    assert.deepEqual(resolvePlan('yearly', '', NOW), { plan: 'free' });
    assert.deepEqual(resolvePlan('yearly', 'not-a-date', NOW), { plan: 'free' });
    assert.deepEqual(resolvePlan('vip', FUTURE, NOW), { plan: 'free' });
  });

  test('access gate follows expiry without a reload', () => {
    assert.equal(hasActivePlan({ plan: 'yearly', planExpiresAt: FUTURE }, NOW), true);
    assert.equal(hasActivePlan({ plan: 'yearly', planExpiresAt: PAST }, NOW), false);
    assert.equal(hasActivePlan({ plan: 'free' }, NOW), false);
    assert.equal(
      hasActivePlan(
        { plan: 'twoYear', planExpiresAt: FUTURE },
        Date.parse('2028-01-01T00:00:00.000Z'),
      ),
      false,
    );
  });
});
