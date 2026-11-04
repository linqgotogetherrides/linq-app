import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AADHAAR_DL_UNAVAILABLE_MESSAGE,
  PAN_PAGE_ROUTE,
  SKIP_FOR_NOW_LABEL,
  VERIFY_WITH_PAN_LABEL,
  actionForDocument,
  documentUnavailableTitle,
} from '../verificationOptions.ts';

describe('action per document', () => {
  test('PAN opens the dedicated page', () => {
    assert.deepEqual(actionForDocument('pan'), { type: 'open_pan_page' });
  });

  test('Aadhaar and driving licence can only show unavailability', () => {
    assert.deepEqual(actionForDocument('aadhaar'), { type: 'show_unavailable', docType: 'aadhaar' });
    assert.deepEqual(actionForDocument('dl'), { type: 'show_unavailable', docType: 'dl' });
    // The gated action must never be confused with a session-starting one:
    // neither shape even carries a session field.
  });

  test('an unknown document resolves to nothing, not to PAN', () => {
    assert.equal(actionForDocument('passport'), null);
    assert.equal(actionForDocument(''), null);
    assert.equal(actionForDocument('PaN'), null, 'case must match exactly');
  });
});

describe('unavailable copy contract', () => {
  test('the required message is verbatim', () => {
    assert.equal(
      AADHAAR_DL_UNAVAILABLE_MESSAGE,
      'This verification method is currently unavailable. You can verify your account using PAN instead.',
    );
  });

  test('the sheet titles name the gated method', () => {
    assert.equal(documentUnavailableTitle('aadhaar'), 'Aadhaar verification unavailable');
    assert.equal(documentUnavailableTitle('dl'), 'Driving Licence verification unavailable');
  });

  test('the sheet offers the two required actions', () => {
    assert.equal(VERIFY_WITH_PAN_LABEL, 'Verify with PAN');
    assert.equal(SKIP_FOR_NOW_LABEL, 'Skip for now');
  });
});

describe('selection screens route through the same policy', () => {
  // __tests__/ -> lib/ -> src/ -> frontend/
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const screens = ['app/account-creation.tsx', 'app/verification.tsx'] as const;

  test('choosing PAN opens the dedicated PAN page', () => {
    for (const screen of screens) {
      const source = readFileSync(resolve(root, screen), 'utf8');
      assert.match(source, /PAN_PAGE_ROUTE/, `${screen} must route to the PAN page`);
      assert.match(source, /actionForDocument\(/, `${screen} must use the shared policy`);
    }
  });

  test('Aadhaar and driving licence open the unavailable sheet instead of being recorded', () => {
    for (const screen of screens) {
      const source = readFileSync(resolve(root, screen), 'utf8');
      assert.match(source, /VerificationUnavailableModal/, `${screen} must show the sheet`);
      assert.match(source, /setUnavailableDoc\(/, `${screen} must track the gated document`);
      assert.doesNotMatch(
        source,
        /verificationDoc\s*=\s*o\.key/,
        `${screen} must not select a gated document as a real choice`,
      );
    }
  });
});

describe('onboarding PAN verification is the completion gate', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const accountCreation = readFileSync(resolve(root, 'app/account-creation.tsx'), 'utf8');
  const panPage = readFileSync(resolve(root, 'app/pan-verification.tsx'), 'utf8');

  test('selecting PAN does not announce completion before verification', () => {
    assert.match(accountCreation, /announceSuccess:\s*false/);
    assert.match(accountCreation, /onboarding:\s*'1'/);
    assert.match(accountCreation, /status:\s*'not_verified'/);
  });

  test('the identity screen finishes with Continue, not Complete Profile', () => {
    assert.doesNotMatch(accountCreation, /Complete Profile/);
    assert.match(accountCreation, /'Continue'/);
  });

  test('PAN navigation keeps the identity screen in history for its back arrow', () => {
    assert.match(accountCreation, /navigation:\s*'push'/);
  });

  test('the PAN page offers an explicit skip-verification exit for onboarding', () => {
    assert.match(panPage, /pan-skip-verification/);
    assert.match(panPage, /Skip verification/);
    assert.match(panPage, /isOnboarding/);
    assert.match(panPage, /Profile created successfully/);
  });
});

describe('PAN page route exists', () => {
  // __tests__/ -> lib/ -> src/ -> frontend/, and the constant's value pins
  // the route file the action must push to.
  const route = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../app',
    `${PAN_PAGE_ROUTE.slice(1)}.tsx`,
  );

  test('the route the actions push to is a real expo-router screen', () => {
    assert.equal(existsSync(route), true, `${PAN_PAGE_ROUTE} must exist as a route file`);
    const source = readFileSync(route, 'utf8');
    assert.match(source, /export default function/, 'the file must export the screen');
    assert.match(source, /create-kyc-session/, 'the screen must drive the trusted session flow');
  });
});
