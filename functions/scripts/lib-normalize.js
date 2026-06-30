/* Mirror of src/app/shared/utils/normalize-name.ts — keep in sync.
 * Canonical dedupe key: folds case, punctuation, diacritics, and whitespace. */
function normalizeBottleName(name) {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`".]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { normalizeBottleName };
