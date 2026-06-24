import { describe, expect, mock, test } from 'bun:test';
import { createTestDatabase } from '../test-helper';

const testDb = createTestDatabase();
mock.module('../../src/config/database', () => ({ db: testDb }));

import { attachmentDisposition } from '../../src/utils/http';

describe('attachmentDisposition', () => {
  test('never emits CR/LF or quotes in the fallback filename', () => {
    const disposition = attachmentDisposition('evil"\r\nX-Injected: yes.txt');
    expect(disposition).not.toContain('\r');
    expect(disposition).not.toContain('\n');
    const fallback = disposition.match(/filename="([^"]*)"/)?.[1] ?? '';
    expect(fallback).not.toContain('"');
    expect(fallback).not.toContain('X-Injected:');
  });

  test('includes an RFC 5987 UTF-8 filename for non-ASCII names', () => {
    const disposition = attachmentDisposition('résumé 2026.pdf');
    expect(disposition).toContain("filename*=UTF-8''");
    expect(disposition).toContain(encodeURIComponent('résumé 2026.pdf'));
    const fallback = disposition.match(/filename="([^"]*)"/)?.[1] ?? '';
    expect(/^[\w.\- ]+$/.test(fallback)).toBe(true);
  });

  test('falls back to a generic name when nothing safe remains', () => {
    expect(attachmentDisposition('"\r\n')).toContain('filename="_"');
  });
});
