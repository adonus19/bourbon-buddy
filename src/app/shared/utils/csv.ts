import { Timestamp } from '@angular/fire/firestore';

/** RFC-4180-ish escaping: quote fields containing comma, quote, or newline. */
function escapeCell(value: unknown): string {
  if (value == null) {
    return '';
  }
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Builds a CSV string from a header row and an array of string-able rows. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(','));
  }
  return lines.join('\r\n');
}

/** Formats a Firestore Timestamp as YYYY-MM-DD (empty string when absent). */
export function csvDate(ts: Timestamp | null | undefined): string {
  const d = ts?.toDate?.();
  return d ? d.toISOString().slice(0, 10) : '';
}
