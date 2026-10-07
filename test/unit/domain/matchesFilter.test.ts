import { describe, expect, it } from 'vitest';
import { matchesFilter } from '../../../src/domain/matchesFilter.js';
import type { Account, AccountFilter } from '../../../src/domain/types.js';

const account: Account = {
  id: 1,
  country: 'US',
  policy: 'MONTHLY',
  relationshipStatus: 'FRIEND',
  credits: 3,
};

const noFilter: AccountFilter = {
  policies: [],
  relationshipStatuses: [],
  countries: [],
  minCredits: null,
  maxCredits: null,
};

const matches = (overrides: Partial<AccountFilter>, acct: Account = account) =>
  matchesFilter(acct, { ...noFilter, ...overrides });

describe('matchesFilter', () => {
  it('matches everyone when no filters are set', () => {
    expect(matches({})).toBe(true);
  });

  it('treats each multi-select as "one of"', () => {
    expect(matches({ policies: ['ANNUAL', 'MONTHLY'] })).toBe(true);
    expect(matches({ policies: ['ANNUAL'] })).toBe(false);
    expect(matches({ relationshipStatuses: ['FRIEND', 'BFF'] })).toBe(true);
    expect(matches({ relationshipStatuses: ['NEW_MEMBER'] })).toBe(false);
    expect(matches({ countries: ['US'] })).toBe(true);
    expect(matches({ countries: ['CA'] })).toBe(false);
  });

  it('requires every set filter to match', () => {
    expect(matches({ countries: ['US'], policies: ['ANNUAL'] })).toBe(false);
    expect(matches({ countries: ['US'], policies: ['MONTHLY'], minCredits: 1 })).toBe(true);
  });

  it('treats min and max credits as inclusive', () => {
    expect(matches({ minCredits: 3 })).toBe(true);
    expect(matches({ minCredits: 4 })).toBe(false);
    expect(matches({ maxCredits: 3 })).toBe(true);
    expect(matches({ maxCredits: 2 })).toBe(false);
  });

  it('supports an exact credit count via min = max', () => {
    expect(matches({ minCredits: 3, maxCredits: 3 })).toBe(true);
    expect(matches({ minCredits: 3, maxCredits: 3 }, { ...account, credits: 2 })).toBe(false);
  });

  it('supports "< 1" as max 0', () => {
    expect(matches({ maxCredits: 0 }, { ...account, credits: 0 })).toBe(true);
    expect(matches({ maxCredits: 0 }, { ...account, credits: 1 })).toBe(false);
  });
});
