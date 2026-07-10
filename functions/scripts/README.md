# Catalog Maintenance Scripts (BB-160)

One-time admin migrations for the shared `/bourbons` catalog. They run locally
with the Firebase Admin SDK using your Google credentials — **not** deployed
functions.

## Prerequisites

```
gcloud auth application-default login   # one-time; provides Application Default Credentials
```

All commands run from the `functions/` directory (so they use its
`firebase-admin` dependency). Set the project explicitly:

```
export GCLOUD_PROJECT=bourbonbuddy-dev
```

## 1. Backfill normalization fields

Populates `nameNormalized`, `aliases`, and `canonicalId` on existing catalog
docs so dedupe matches legacy entries. Idempotent.

```
node scripts/backfill-catalog.js
```

## 2. Merge duplicates

Finds catalog docs sharing a normalized name, merges each group into one
canonical entry, and repoints all references. **Dry run by default** — review the
output, then re-run with `--apply`.

```
node scripts/merge-catalog-duplicates.js            # preview
node scripts/merge-catalog-duplicates.js --apply    # apply
```

Run the backfill first. If Firestore asks for a collection-group index on
`bourbonId`, follow the link it prints, wait for it to build, then re-run.

> Back up Firestore (or export) before `--apply` if you want a safety net —
> reference repointing is not automatically reversible.

## 3. Remove junk AI-created bottles

Article extraction creates catalog entries, and before the filters existed it
created two kinds of garbage — each of which the flavor-enrichment sweep then
gave an invented tasting profile. Both scripts only ever consider AI-created
docs (`createdByUserId == "system:ai"`), skip anything a user has logged,
wishlisted, or sighted, and are **dry run by default**. On `--apply` they also
scrub the deleted bottles out of cached `mentionedBottles` chips on news
articles and `similarBottles` neighbor lists (shared rails in `lib-catalog.js`).

Non-whiskey products (tequila, gin, beer …) — classified by Groq (BB-195):

```
GROQ_API_KEY=... node scripts/cleanup-non-whiskey.js            # preview
GROQ_API_KEY=... node scripts/cleanup-non-whiskey.js --apply
```

Descriptive phrases and bare company names — "award-winning bourbon",
"small-batch expressions", "Pursuit Spirits" (BB-201). No model call: it imports
the same `isProductName` predicate the live extractor filters on, so run
`npm run build` first and the script can never disagree with production.

```
npm run build
node scripts/cleanup-generic-names.js            # preview
node scripts/cleanup-generic-names.js --apply
```

> Back up Firestore before `--apply` if you want a safety net — deletion is not
> reversible.
