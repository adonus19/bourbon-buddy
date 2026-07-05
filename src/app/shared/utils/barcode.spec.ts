import { normalizeBarcode } from './barcode';

describe('normalizeBarcode', () => {
  it('accepts a 12-digit UPC-A', () => {
    expect(normalizeBarcode('012345678905')).toBe('012345678905');
  });

  it('accepts a 13-digit EAN-13', () => {
    expect(normalizeBarcode('0123456789012')).toBe('0123456789012');
  });

  it('accepts an 8-digit EAN-8 / UPC-E', () => {
    expect(normalizeBarcode('01234565')).toBe('01234565');
  });

  it('strips spaces, dashes and other non-digits before validating', () => {
    expect(normalizeBarcode(' 0 12345 67890 5 ')).toBe('012345678905');
    expect(normalizeBarcode('0-12345-67890-5')).toBe('012345678905');
  });

  it('rejects codes that are the wrong length', () => {
    expect(normalizeBarcode('123')).toBeNull();
    expect(normalizeBarcode('01234567890')).toBeNull(); // 11
    expect(normalizeBarcode('01234567890123')).toBeNull(); // 14
  });

  it('rejects empty / nullish input', () => {
    expect(normalizeBarcode('')).toBeNull();
    expect(normalizeBarcode(null)).toBeNull();
    expect(normalizeBarcode(undefined)).toBeNull();
    expect(normalizeBarcode('   ')).toBeNull();
  });
});
