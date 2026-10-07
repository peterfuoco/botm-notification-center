import { describe, expect, it } from 'vitest';
import {
  accountIdHeaderSchema,
  feedQuerySchema,
  idParamSchema,
} from '../../../src/domain/validation/requestSchemas.js';

describe('idParamSchema', () => {
  it('coerces numeric path params', () => {
    expect(idParamSchema.parse({ id: '42' })).toEqual({ id: 42 });
  });

  it.each(['0', '-1', '1.5', 'abc', '9007199254740993'])('rejects %s', (id) => {
    expect(idParamSchema.safeParse({ id }).success).toBe(false);
  });
});

describe('feedQuerySchema', () => {
  it('defaults limit to 20 and leaves cursor undefined', () => {
    expect(feedQuerySchema.parse({})).toEqual({ limit: 20 });
  });

  it.each(['0', '51', 'ten'])('rejects limit %s', (limit) => {
    expect(feedQuerySchema.safeParse({ limit }).success).toBe(false);
  });
});

describe('accountIdHeaderSchema', () => {
  it('parses a positive integer header', () => {
    expect(accountIdHeaderSchema.parse('7')).toBe(7);
  });

  it.each(['', '0', '-3', '7abc', '1e3', '9007199254740993'])('rejects %j', (value) => {
    expect(accountIdHeaderSchema.safeParse(value).success).toBe(false);
  });
});
