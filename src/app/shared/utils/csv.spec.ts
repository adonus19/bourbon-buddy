import { Timestamp } from '@angular/fire/firestore';
import { csvDate, toCsv } from './csv';

describe('toCsv', () => {
  it('joins a header row and data rows with CRLF', () => {
    const csv = toCsv(['a', 'b'], [['1', '2'], ['3', '4']]);
    expect(csv).toBe('a,b\r\n1,2\r\n3,4');
  });

  it('quotes cells containing commas, quotes, or newlines', () => {
    const csv = toCsv(['name'], [['a,b'], ['say "hi"'], ['line1\nline2']]);
    expect(csv).toBe('name\r\n"a,b"\r\n"say ""hi"""\r\n"line1\nline2"');
  });

  it('renders nullish cells as empty and coerces non-strings', () => {
    expect(toCsv(['x', 'y', 'z'], [[null, undefined, 42]])).toBe(
      'x,y,z\r\n,,42'
    );
  });
});

describe('csvDate', () => {
  it('formats a Timestamp as YYYY-MM-DD', () => {
    const ts = {
      toDate: () => new Date(Date.UTC(2026, 2, 9)),
    } as unknown as Timestamp;
    expect(csvDate(ts)).toBe('2026-03-09');
  });

  it('returns empty string for null/undefined', () => {
    expect(csvDate(null)).toBe('');
    expect(csvDate(undefined)).toBe('');
  });
});
