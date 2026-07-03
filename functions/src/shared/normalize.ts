/**
 * Canonical bottle-name key — mirror of src/app/shared/utils/normalize-name.ts
 * and functions/scripts/lib-normalize.js (BB-160). Folds case, punctuation,
 * diacritics, and whitespace so "Blanton's Single Barrel" and
 * "blantons single barrel" match. Keep the three copies in sync.
 */
export function normalizeBottleName(name: string): string {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`".]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
