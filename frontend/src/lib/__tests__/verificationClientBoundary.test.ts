import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Client-boundary checks.
 *
 * A runtime test cannot prove a negative across React Native's async stack,
 * so these hold the source itself to a contract instead: everything a rider
 * can touch in the verification screens may poll status and start a session,
 * but no client file may write a verified state, and the only writer of a
 * trusted outcome anywhere in this app remains the backend (signed Cashfree
 * webhook -> apply_kyc_outcome, enforced further by the
 * guard_user_profile_verification_status trigger).
 *
 * If a change regresses any assertion here, the honest response is to fix the
 * change, never to loosen the contract.
 */

const here = fileURLToPath(import.meta.url);
// __tests__/ -> lib/ -> src/ -> frontend/. Path joins instead of URL bases:
// this project's lib configuration resolves `new URL` to the DOM type, which
// node's fs/url typings do not accept.
const frontendRoot = resolve(dirname(here), '../../..');

function source(relativePath: string): string {
  return readFileSync(join(frontendRoot, relativePath), 'utf8');
}

/** Drops lines that are only comments, so prose about the design cannot trip the contract. */
function code(relativePath: string): string {
  return source(relativePath)
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
}

const SCREENS = [
  'app/verification.tsx',
  'app/verification-profile.tsx',
  'app/pan-verification.tsx',
  'src/components/VerificationUnavailableModal.tsx',
  'src/components/VerificationWebView.tsx',
] as const;

/** Nothing a rider does may claim a verified state. */
const FORBIDDEN_VERIFIED_WRITES: RegExp[] = [
  /verification_status:\s*'verified'/,
  /verification_status\s*=\s*'verified'/,
  /kyc_status:\s*'verified'/,
  /apply_kyc_outcome/,
];

describe('no client file marks a rider verified', () => {
  for (const path of SCREENS) {
    test(`${path} contains no verified write`, () => {
      const content = code(path);
      for (const pattern of FORBIDDEN_VERIFIED_WRITES) {
        assert.doesNotMatch(content, pattern, `${path} must not set a verified state client-side`);
      }
    });
  }

  test("the onboarding selection screen's only client value for verification_status is 'pending'", () => {
    // 'pending' is what the trigger guard already allows: it cannot verify,
    // cannot un-verify a verified account (see the pre-check in
    // handleContinue), and is what signup needs.
    const content = source(SCREENS[0]);
    const assigned = content.match(/verification_status:\s*'([a-z_]+)'/g) ?? [];
    assert.ok(assigned.length > 0, 'the screen should still record the document choice');
    for (const entry of assigned) {
      assert.match(entry, /'pending'$/);
    }
  });
});

describe('session creation stays in exactly one place', () => {
  test('the PAN page invokes only the trusted session endpoint', () => {
    const content = code('app/pan-verification.tsx');
    const invoked = content.match(/functions\.invoke\('([a-z0-9-]+)'/g) ?? [];
    assert.deepEqual(invoked, ["functions.invoke('create-kyc-session'"]);
    // The session body must be exactly the document type: the typed PAN
    // number is input hygiene, never transmitted, and no rider identifier is
    // ever supplied by the client.
    assert.match(content, /body: \{ type: 'pan' \}/);
  });

  test('the selection pages no longer start sessions themselves', () => {
    for (const path of ['app/verification-profile.tsx', 'app/verification.tsx']) {
      const content = code(path);
      assert.doesNotMatch(content, /create-kyc-session/, `${path} must route, not create sessions`);
    }
  });
});

describe('no direct table writes from the verification screens', () => {
  test('the PAN page and the modal never touch a table client-side', () => {
    for (const path of ['app/pan-verification.tsx', 'src/components/VerificationUnavailableModal.tsx']) {
      const content = code(path);
      assert.doesNotMatch(content, /\.from\(\s*'/, `${path} must not query or write tables directly`);
    }
  });

  test("verification_status is only 'pending' when the onboarding screen writes it directly", () => {
    const content = code('app/verification.tsx');
    const updateBlocks = content.match(/\.update\(\{[\s\S]*?\}\)/g) ?? [];
    assert.ok(updateBlocks.length > 0);
    for (const block of updateBlocks) {
      assert.doesNotMatch(block, /'verified'/);
    }
  });
});

describe('the WebView carries no outcome handler', () => {
  test('closing or navigating the hosted form cannot fire success', () => {
    const content = code('src/components/VerificationWebView.tsx');
    assert.doesNotMatch(content, /onSuccess/);
    assert.doesNotMatch(content, /onNavigationStateChange/);
    assert.doesNotMatch(content, /verification-success/);
    assert.doesNotMatch(content, /\.update\(/);
  });
});
