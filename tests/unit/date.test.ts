import { describe, expect, test } from 'bun:test';
import { formatDateOnly, isDateOverdue, localToday, toDateOnly } from '../../src/utils/date';

describe('date-only helpers', () => {
  test('preserves a stored calendar date independent of local timezone', () => {
    const value = new Date('2026-01-02T00:00:00.000Z');
    expect(toDateOnly(value)).toBe('2026-01-02');
    expect(formatDateOnly(value, { month: 'short', day: 'numeric' })).toBe('Jan 2');
  });

  test('marks a due date overdue only after its calendar day', () => {
    expect(isDateOverdue('2026-01-02', new Date('2026-01-02T23:59:59'))).toBe(false);
    expect(isDateOverdue('2026-01-01', new Date('2026-01-02T00:00:00'))).toBe(true);
  });

  test('formats local today without converting through UTC', () => {
    expect(localToday(new Date(2026, 0, 2, 23, 59))).toBe('2026-01-02');
  });
});
