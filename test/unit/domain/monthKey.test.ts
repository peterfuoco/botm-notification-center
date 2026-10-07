import { describe, expect, it } from 'vitest';
import { monthKey } from '../../../src/domain/monthKey.js';

describe('monthKey', () => {
  it('formats as zero-padded YYYY-MM', () => {
    expect(monthKey(new Date('2026-03-15T00:00:00Z'))).toBe('2026-03');
    expect(monthKey(new Date('2026-10-07T00:00:00Z'))).toBe('2026-10');
  });

  it('changes exactly at the UTC year boundary', () => {
    expect(monthKey(new Date('2026-12-31T23:59:59.999Z'))).toBe('2026-12');
    expect(monthKey(new Date('2027-01-01T00:00:00.000Z'))).toBe('2027-01');
  });

  it('uses UTC, not local offsets', () => {
    expect(monthKey(new Date('2026-10-31T22:00:00-05:00'))).toBe('2026-11');
  });

  it('handles leap day', () => {
    expect(monthKey(new Date('2028-02-29T12:00:00Z'))).toBe('2028-02');
  });
});
