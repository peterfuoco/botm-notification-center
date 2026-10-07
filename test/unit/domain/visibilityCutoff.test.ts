import { describe, expect, it } from 'vitest';
import { visibilityCutoff } from '../../../src/domain/visibilityCutoff.js';

const cutoff = (iso: string) => visibilityCutoff(new Date(iso)).toISOString();

describe('visibilityCutoff', () => {
  it('is the start of the previous UTC month', () => {
    expect(cutoff('2026-10-07T15:00:00Z')).toBe('2026-09-01T00:00:00.000Z');
  });

  it('rolls back across the year boundary in January', () => {
    expect(cutoff('2027-01-10T00:00:00Z')).toBe('2026-12-01T00:00:00.000Z');
  });

  it('changes exactly at the first instant of a new month', () => {
    expect(cutoff('2026-09-30T23:59:59.999Z')).toBe('2026-08-01T00:00:00.000Z');
    expect(cutoff('2026-10-01T00:00:00.000Z')).toBe('2026-09-01T00:00:00.000Z');
  });

  it('uses UTC, not local offsets', () => {
    // 2026-10-01 02:00 in UTC+05:00 is still Sep 30 in UTC.
    expect(cutoff('2026-10-01T02:00:00+05:00')).toBe('2026-08-01T00:00:00.000Z');
  });

  it('matches the spec example: sent Aug 15, visible through Sep 30, gone Oct 1', () => {
    const sent = new Date('2026-08-15T12:00:00Z');
    expect(sent >= visibilityCutoff(new Date('2026-09-30T23:59:59Z'))).toBe(true);
    expect(sent >= visibilityCutoff(new Date('2026-10-01T00:00:00Z'))).toBe(false);
  });

  it('handles March in a leap year', () => {
    expect(cutoff('2028-03-31T00:00:00Z')).toBe('2028-02-01T00:00:00.000Z');
  });
});
