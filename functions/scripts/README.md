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
