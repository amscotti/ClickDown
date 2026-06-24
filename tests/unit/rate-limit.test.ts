import { beforeEach, describe, expect, test } from 'bun:test';
import { checkRateLimit, resetRateLimit } from '../../src/utils/rate-limit';

describe('rate limiting', () => {
  beforeEach(() => {
    resetRateLimit();
  });

  test('blocks a key after the per-window limit', () => {
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit('scope:key')).toBe(true);
    }
    expect(checkRateLimit('scope:key')).toBe(false);
  });

  test('scoped keys are independent buckets', () => {
    for (let i = 0; i < 10; i++) checkRateLimit('login:local');
    expect(checkRateLimit('login:local')).toBe(false);
    // Other scopes and other identities are unaffected.
    expect(checkRateLimit('register:local')).toBe(true);
    expect(checkRateLimit('login:10.0.0.2')).toBe(true);
  });

  test('many distinct keys do not break the limiter', () => {
    for (let i = 0; i < 10_500; i++) {
      expect(checkRateLimit(`ip-${i}`)).toBe(true);
    }
    // Still functional after exceeding the key bound.
    expect(checkRateLimit('ip-after')).toBe(true);
  });

  test('resetRateLimit clears all buckets', () => {
    for (let i = 0; i < 10; i++) checkRateLimit('scope:key');
    expect(checkRateLimit('scope:key')).toBe(false);
    resetRateLimit();
    expect(checkRateLimit('scope:key')).toBe(true);
  });
});
