import { normalizeBottleName } from './normalize-name';

describe('normalizeBottleName (app)', () => {
  it('folds case, punctuation, diacritics, and whitespace', () => {
    expect(normalizeBottleName("Blanton's Single Barrel")).toBe(
      'blantons single barrel'
    );
    expect(normalizeBottleName('E.H. Taylor')).toBe('eh taylor');
    expect(normalizeBottleName('Weller  12 - Year!!')).toBe('weller 12 year');
    expect(normalizeBottleName('Blanton’s')).toBe('blantons'); // curly quote
  });

  it('is null-safe', () => {
    expect(normalizeBottleName('')).toBe('');
    expect(normalizeBottleName(undefined as unknown as string)).toBe('');
    expect(normalizeBottleName(null as unknown as string)).toBe('');
  });

  it('preserves distinguishing descriptive words', () => {
    expect(normalizeBottleName('Single Barrel')).not.toBe(
      normalizeBottleName('Small Batch')
    );
  });
});
