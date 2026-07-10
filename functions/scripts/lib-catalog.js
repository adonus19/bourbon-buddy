/**
 * Shared rails for the one-time catalog cleanup scripts.
 *
 * Deleting a catalog doc is only safe once nothing points at it, and it leaves
 * two kinds of dangling reference behind: cached `mentionedBottles` chips on
 * news articles, and cached `similarBottles` neighbors on other catalog docs.
 * Both are scrubbed here so a cleanup can't leave the UI offering chips that
 * navigate to a deleted bottle.
 */
const ARTICLE_SCRUB_LIMIT = 1000; // newest articles checked for dead chips
const BATCH_OPS = 400;

/** Every bourbonId referenced by any log entry, wishlist entry, or sighting. */
async function collectReferencedIds(db) {
  const referenced = new Set();
  const users = await db.collection("users").select().get();
  for (const user of users.docs) {
    for (const sub of ["logEntries", "wishlistEntries"]) {
      const entries = await user.ref.collection(sub).select("bourbonId").get();
      for (const doc of entries.docs) {
        const id = doc.get("bourbonId");
        if (id) referenced.add(id);
      }
    }
  }
  const sightings = await db.collection("sightings").select("bourbonId").get();
  for (const doc of sightings.docs) {
    const id = doc.get("bourbonId");
    if (id) referenced.add(id);
  }
  return referenced;
}

/** Commits `updates` ([ref, data] pairs) in chunks under the 500-op batch cap. */
async function commitAll(db, updates) {
  let batch = db.batch();
  let ops = 0;
  for (const [ref, data] of updates) {
    if (data === null) {
      batch.delete(ref);
    } else {
      batch.update(ref, data);
    }
    if (++ops >= BATCH_OPS) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
}

/** Removes deleted bottles from cached mentionedBottles on recent articles. */
async function scrubArticles(db, deletedIds) {
  const articles = await db
    .collection("newsArticles")
    .orderBy("fetchedAt", "desc")
    .limit(ARTICLE_SCRUB_LIMIT)
    .get();
  const updates = [];
  for (const doc of articles.docs) {
    const bottles = doc.get("mentionedBottles");
    if (!Array.isArray(bottles) || bottles.length === 0) continue;
    const kept = bottles.filter((b) => !deletedIds.has(b?.bourbonId));
    if (kept.length === bottles.length) continue;
    updates.push([doc.ref, { mentionedBottles: kept }]);
  }
  await commitAll(db, updates);
  return updates.length;
}

/**
 * Removes deleted bottles from the precomputed `similarBottles` neighbor lists
 * (BB-197) on every other catalog doc. Without this, "Similar bottles" keeps
 * offering a card that opens a deleted bottle until the next similarity sweep.
 */
async function scrubSimilarBottles(db, deletedIds) {
  const snap = await db.collection("bourbons").get();
  const updates = [];
  for (const doc of snap.docs) {
    if (deletedIds.has(doc.id)) continue;
    const neighbors = doc.get("similarBottles");
    if (!Array.isArray(neighbors) || neighbors.length === 0) continue;
    const kept = neighbors.filter((n) => !deletedIds.has(n?.bourbonId));
    if (kept.length === neighbors.length) continue;
    updates.push([doc.ref, { similarBottles: kept }]);
  }
  await commitAll(db, updates);
  return updates.length;
}

/** Deletes the docs, then scrubs every cached reference to them. */
async function deleteAndScrub(db, docs) {
  await commitAll(
    db,
    docs.map((d) => [d.ref, null])
  );
  const deletedIds = new Set(docs.map((d) => d.id));
  const articles = await scrubArticles(db, deletedIds);
  const neighbors = await scrubSimilarBottles(db, deletedIds);
  return { articles, neighbors };
}

module.exports = {
  collectReferencedIds,
  scrubArticles,
  scrubSimilarBottles,
  deleteAndScrub,
};
