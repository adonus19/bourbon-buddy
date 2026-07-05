/**
 * Barcode helpers (BB-174). Bottles carry retail UPC/EAN symbologies; we accept
 * the common ones and normalize anything scanned or typed to plain digits.
 */
export const SUPPORTED_BARCODE_FORMATS = [
  'upc_a',
  'upc_e',
  'ean_13',
  'ean_8',
] as const;
export type SupportedBarcodeFormat = (typeof SUPPORTED_BARCODE_FORMATS)[number];

// UPC-E / EAN-8 = 8, UPC-A = 12, EAN-13 = 13.
const VALID_LENGTHS = new Set([8, 12, 13]);

/**
 * Strip a scanned/typed barcode down to digits and validate its length.
 * Returns the cleaned code, or null if it isn't a plausible UPC/EAN.
 */
export function normalizeBarcode(
  raw: string | null | undefined
): string | null {
  if (!raw) {
    return null;
  }
  const digits = raw.replace(/\D+/g, '');
  return VALID_LENGTHS.has(digits.length) ? digits : null;
}
