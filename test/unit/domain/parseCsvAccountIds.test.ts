import { describe, expect, it } from 'vitest';
import { parseCsvAccountIds } from '../../../src/domain/parseCsvAccountIds.js';

describe('parseCsvAccountIds', () => {
  it('parses one id per line', () => {
    expect(parseCsvAccountIds('1\n2\n3')).toEqual({
      ids: [1, 2, 3],
      invalidLines: [],
      duplicateCount: 0,
    });
  });

  it('handles CRLF, surrounding whitespace, blank lines and a trailing newline', () => {
    expect(parseCsvAccountIds('  1 \r\n\r\n2\r\n   \r\n3\r\n').ids).toEqual([1, 2, 3]);
  });

  it('skips a non-numeric header row without reporting it', () => {
    const result = parseCsvAccountIds('account_id\n1\n2');
    expect(result.ids).toEqual([1, 2]);
    expect(result.invalidLines).toEqual([]);
  });

  it('only treats the first non-blank line as a possible header', () => {
    const result = parseCsvAccountIds('\naccount_id\n1\nabc\n2');
    expect(result.ids).toEqual([1, 2]);
    expect(result.invalidLines).toEqual([{ line: 4, value: 'abc' }]);
  });

  it('reads only the first column and strips quotes', () => {
    expect(parseCsvAccountIds('account_id,name\n"12",Jane\n13,Sam').ids).toEqual([12, 13]);
  });

  it('strips a UTF-8 BOM', () => {
    expect(parseCsvAccountIds('\uFEFF7\n8').ids).toEqual([7, 8]);
  });

  it('dedupes and counts duplicates, keeping first-seen order', () => {
    const result = parseCsvAccountIds('5\n3\n5\n3\n5');
    expect(result.ids).toEqual([5, 3]);
    expect(result.duplicateCount).toBe(3);
  });

  it('normalizes leading zeros so "007" and "7" are the same id', () => {
    const result = parseCsvAccountIds('7\n007');
    expect(result.ids).toEqual([7]);
    expect(result.duplicateCount).toBe(1);
  });

  it('reports zero, negatives, decimals and junk with 1-based line numbers', () => {
    const result = parseCsvAccountIds('1\n0\n-4\n2.5\n1e3\nabc\n2');
    expect(result.ids).toEqual([1, 2]);
    expect(result.invalidLines).toEqual([
      { line: 2, value: '0' },
      { line: 3, value: '-4' },
      { line: 4, value: '2.5' },
      { line: 5, value: '1e3' },
      { line: 6, value: 'abc' },
    ]);
  });

  it('accepts Number.MAX_SAFE_INTEGER but rejects anything larger', () => {
    const max = String(Number.MAX_SAFE_INTEGER); // 9007199254740991
    const result = parseCsvAccountIds(
      `1\n${max}\n9007199254740992\n9007199254740993\n99999999999999999999`,
    );
    expect(result.ids).toEqual([1, Number.MAX_SAFE_INTEGER]);
    expect(result.invalidLines.map((l) => l.value)).toEqual([
      '9007199254740992',
      '9007199254740993',
      '99999999999999999999',
    ]);
  });

  it('returns nothing for empty input', () => {
    expect(parseCsvAccountIds('')).toEqual({ ids: [], invalidLines: [], duplicateCount: 0 });
    expect(parseCsvAccountIds('account_id\n')).toEqual({
      ids: [],
      invalidLines: [],
      duplicateCount: 0,
    });
  });
});
