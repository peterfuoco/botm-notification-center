/** Upper bound on IDs per upload, keeping the single INSERT ... WHERE id IN (...) reasonable. */
export const MAX_CSV_IDS = 50_000;

const MAX_SAFE_ID = BigInt(Number.MAX_SAFE_INTEGER);

export interface InvalidCsvLine {
  line: number; // 1-based line number in the upload
  value: string;
}

export interface ParsedCsvAccountIds {
  ids: number[];
  invalidLines: InvalidCsvLine[];
  duplicateCount: number;
}

/**
 * Parses an uploaded CSV of account IDs. Only the first column is read. Blank lines and a
 * non-numeric first line (header) are skipped. IDs must be positive integers no larger than
 * Number.MAX_SAFE_INTEGER (bigger values would silently lose precision as JS numbers).
 */
export function parseCsvAccountIds(text: string): ParsedCsvAccountIds {
  const ids = new Set<number>();
  const invalidLines: InvalidCsvLine[] = [];
  let duplicateCount = 0;
  let seenContent = false;

  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const value = firstColumn(rawLine);
    if (value === '') return;

    const isFirstContentLine = !seenContent;
    seenContent = true;

    const id = toAccountId(value);
    if (id === null) {
      if (!isFirstContentLine) invalidLines.push({ line: index + 1, value });
      return;
    }
    if (ids.has(id)) {
      duplicateCount += 1;
      return;
    }
    ids.add(id);
  });

  return { ids: [...ids], invalidLines, duplicateCount };
}

function firstColumn(line: string): string {
  const cell = (line.split(',')[0] ?? '').trim();
  return cell.length >= 2 && cell.startsWith('"') && cell.endsWith('"')
    ? cell.slice(1, -1).trim()
    : cell;
}

function toAccountId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  // Compare as BigInt so the range check itself can't lose precision.
  const big = BigInt(value);
  if (big <= 0n || big > MAX_SAFE_ID) return null;
  return Number(big);
}
