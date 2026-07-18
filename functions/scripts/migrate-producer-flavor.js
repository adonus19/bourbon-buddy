#!/usr/bin/env node
/**
 * BB-227 one-time migration: fix legacy bottles whose producer (press-release)
 * tasting notes were kept marketing-only while an AI GENERIC profile filled the
 * arrays. Under the new rules producer notes belong IN the arrays and AI is a
 * last resort — but existing bottles were already seeded, so a plain re-sweep
 * would skip them (flavor-seed idempotency).
 *
 * Fix: for each affected bottle (source=ai, has marketingTagCounts, no
 * review/producer count), clear its flavorProfile and re-queue its source
 * articles (reset `bottlesExtractedAt`). The scheduled sweep then re-extracts
 * them, re-seeding producer notes straight into the arrays; the new AI-skip and
 * AI-only-replace rules guarantee the final profile is producer-sourced, not the
 * old AI guess — even if an enrichment pass runs in between.
 *
 * Run with Application Default Credentials (dry-run by default):
 *   gcloud auth application-default login
 *   GCLOUD_PROJECT=bourbonbuddy-dev node scripts/migrate-producer-flavor.js
 *   GCLOUD_PROJECT=bourbonbuddy-dev node scripts/migrate-producer-flavor.js --apply
 */
const admin = require("firebase-admin");

const projectId = process.env.GCLOUD_PROJECT || "bourbonbuddy-dev";
const APPLY = process.argv.includes("--apply");
admin.initializeApp({ projectId });
const db = admin.firestore();

/** A legacy AI-over-producer profile: producer notes exist but never reached the arrays. */
function isAffected(fp) {
  return (
    fp &&
    fp.source === "ai" &&
    !fp.reviewCount &&
    !fp.producerCount &&
    fp.marketingTagCounts &&
    Object.keys(fp.marketingTagCounts).length > 0
  );
}

async function main() {
  const snap = await db.collection("bourbons").get();
  const affected = [];
  const articleIds = new Set();
  for (const doc of snap.docs) {
    const fp = doc.get("flavorProfile");
    if (isAffected(fp)) {
      affected.push(doc);
      for (const id of fp.seededArticleIds ?? []) {
        articleIds.add(id);
      }
    }
  }

  console.log(
    `Scanned ${snap.size} bottles. Affected (AI-over-producer): ${affected.length}. ` +
      `Source articles to re-queue: ${articleIds.size}.`
  );
  for (const doc of affected.slice(0, 20)) {
    console.log(`  - ${doc.get("name")} (${doc.id})`);
  }
  if (affected.length > 20) console.log(`  … and ${affected.length - 20} more`);

  if (!APPLY) {
    console.log("\nDRY RUN — re-run with --apply to reset these + re-queue articles.");
    return;
  }

  let ops = 0;
  let batch = db.batch();
  const flush = async () => {
    if (ops > 0) await batch.commit();
    batch = db.batch();
    ops = 0;
  };
  // Clear the affected bottles' AI profile so the re-seed rebuilds it fresh.
  for (const doc of affected) {
    batch.update(doc.ref, { flavorProfile: null, flavorEnrichedAt: null });
    if (++ops >= 400) await flush();
  }
  // Re-queue the source articles for re-extraction by the sweep.
  for (const id of articleIds) {
    batch.update(db.collection("newsArticles").doc(id), {
      bottlesExtractedAt: admin.firestore.FieldValue.delete(),
    });
    if (++ops >= 400) await flush();
  }
  await flush();
  console.log(
    `\nApplied: reset ${affected.length} bottles, re-queued ${articleIds.size} articles. ` +
      `The scheduled sweep will re-seed producer notes into the arrays (paced by RPD).`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
