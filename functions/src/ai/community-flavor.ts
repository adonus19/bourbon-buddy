/**
 * Crowdsourced flavor aggregation (BB-188) — pure core.
 *
 * Turns the confirmed flavor tags on many users' log entries for one bottle into
 * a community tier that sits ATOP the BB-222 provenance ladder (user-confirmed >
 * review > AI > marketing). The cardinal rule is **distinct users, not distinct
 * entries**: a tag counts once per user per bottle no matter how many times they
 * logged it or which stages they used — so one prolific logger can't manufacture
 * a consensus. A tag only surfaces once `COMMUNITY_FLOOR` separate people confirm
 * it, which is also the privacy guard: no single palate is ever effectively
 * published on a shared bottle.
 *
 * `aggregateUserFlavor` is pure and Firestore-free (unit-tested here);
 * `onLogEntryWrittenAggregateFlavor` below feeds it from a cross-user
 * collectionGroup query and persists the community tier onto the bottle's
 * flavorProfile, preserving every BB-222 field.
 */
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

import {
  FlavorProvenance,
  FlavorTags,
  profileProvenance,
} from "./flavor-enrichment";

/** Distinct users required before a tag is treated as community consensus. */
export const COMMUNITY_FLOOR = 2;

/** One log entry's confirmed tags, tagged with its owner (for dedupe). */
export interface UserTaggedEntry {
  uid: string;
  noseTags: string[];
  palateTags: string[];
  finishTags: string[];
}

export interface CommunityFlavor {
  /** Community-confirmed tags placed in their plurality stage (floor-gated). */
  userTags: FlavorTags;
  /** Distinct-user count per tag (cross-stage), floor-gated. */
  userTagCounts: Record<string, number>;
  /** Distinct users who confirmed at least one tag for this bottle. */
  contributorCount: number;
}

type Stage = keyof FlavorTags;
const STAGES: Stage[] = ["nose", "palate", "finish"];

const clean = (tags: unknown): string[] =>
  Array.isArray(tags)
    ? tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    : [];

/**
 * Aggregate confirmed tags across users for a single bottle. Groups by uid,
 * dedupes per user, counts distinct users per tag and per (tag, stage), then
 * keeps only tags meeting the floor — placing each in the stage the most users
 * put it (ties broken by stage order).
 */
export function aggregateUserFlavor(
  entries: UserTaggedEntry[]
): CommunityFlavor {
  // tag -> set of uids (cross-stage); tag -> stage -> set of uids.
  const usersByTag = new Map<string, Set<string>>();
  const usersByTagStage = new Map<string, Map<Stage, Set<string>>>();
  const contributors = new Set<string>();

  for (const e of entries) {
    const perStage: Record<Stage, string[]> = {
      nose: clean(e.noseTags),
      palate: clean(e.palateTags),
      finish: clean(e.finishTags),
    };
    let contributed = false;
    for (const stage of STAGES) {
      for (const tag of new Set(perStage[stage])) {
        contributed = true;
        if (!usersByTag.has(tag)) {
          usersByTag.set(tag, new Set());
          usersByTagStage.set(tag, new Map());
        }
        usersByTag.get(tag)!.add(e.uid);
        const stages = usersByTagStage.get(tag)!;
        if (!stages.has(stage)) {
          stages.set(stage, new Set());
        }
        stages.get(stage)!.add(e.uid);
      }
    }
    if (contributed) {
      contributors.add(e.uid);
    }
  }

  const userTags: FlavorTags = { nose: [], palate: [], finish: [] };
  const userTagCounts: Record<string, number> = {};
  // Order tags by descending distinct-user count for stable, weighted arrays.
  const ranked = [...usersByTag.entries()]
    .map(([tag, users]) => ({ tag, count: users.size }))
    .filter((t) => t.count >= COMMUNITY_FLOOR)
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  for (const { tag, count } of ranked) {
    userTagCounts[tag] = count;
    // Plurality stage: most distinct users; tie broken by STAGES order.
    const stages = usersByTagStage.get(tag)!;
    let best: Stage = "nose";
    let bestN = -1;
    for (const stage of STAGES) {
      const n = stages.get(stage)?.size ?? 0;
      if (n > bestN) {
        bestN = n;
        best = stage;
      }
    }
    userTags[best].push(tag);
  }

  return { userTags, userTagCounts, contributorCount: contributors.size };
}

// ————— Firestore trigger (BB-188) —————

const tagArrays = (d: FirebaseFirestore.DocumentData | undefined): unknown[] => [
  d?.noseTags ?? [],
  d?.palateTags ?? [],
  d?.finishTags ?? [],
];

/** True when a log-entry edit changed nothing the aggregate depends on. */
const tagIrrelevantEdit = (
  before: FirebaseFirestore.DocumentData | undefined,
  after: FirebaseFirestore.DocumentData | undefined
): boolean =>
  !!before &&
  !!after &&
  before.bourbonId === after.bourbonId &&
  JSON.stringify(tagArrays(before)) === JSON.stringify(tagArrays(after));

/** Whether stored community state already matches a fresh aggregate. */
const sameCommunity = (a: FlavorProvenance, c: CommunityFlavor): boolean =>
  a.contributorCount === c.contributorCount &&
  JSON.stringify(a.userTagCounts) === JSON.stringify(c.userTagCounts) &&
  JSON.stringify(a.userTags) === JSON.stringify(c.userTags);

/**
 * Recompute one bottle's community tier from ALL users' confirmed tags and
 * persist it, preserving every other flavorProfile field. Full recompute (not
 * incremental) so edits and deletes self-heal. Best-effort; the caller catches.
 */
async function recomputeBottleCommunity(
  db: FirebaseFirestore.Firestore,
  bourbonId: string
): Promise<void> {
  const snap = await db
    .collectionGroup("logEntries")
    .where("bourbonId", "==", bourbonId)
    .select("bourbonId", "noseTags", "palateTags", "finishTags")
    .get();
  const entries: UserTaggedEntry[] = snap.docs.map((d) => ({
    // The owner uid is the grandparent of a users/{uid}/logEntries/{id} doc.
    uid: d.ref.parent.parent?.id ?? "",
    noseTags: (d.get("noseTags") as string[]) ?? [],
    palateTags: (d.get("palateTags") as string[]) ?? [],
    finishTags: (d.get("finishTags") as string[]) ?? [],
  }));
  const community = aggregateUserFlavor(entries);

  const ref = db.collection("bourbons").doc(bourbonId);
  const bottle = await ref.get();
  if (!bottle.exists) {
    return; // no catalog doc (e.g. a client-only bottle) — nothing to attach to
  }
  const profile =
    (bottle.get("flavorProfile") as Record<string, unknown> | undefined) ?? null;

  const noCommunity =
    community.contributorCount === 0 &&
    Object.keys(community.userTagCounts).length === 0;
  if (noCommunity && !profile) {
    return; // don't create an empty profile just to store zeros
  }
  if (sameCommunity(profileProvenance(profile), community)) {
    return; // nothing changed — skip the write
  }

  await ref.update({
    flavorProfile: {
      ...(profile ?? {}),
      userTags: community.userTags,
      userTagCounts: community.userTagCounts,
      contributorCount: community.contributorCount,
    },
    // A community change is a real flavor change; stamp it for observability.
    // NOTE: deliberately NOT flavorEnrichedAt — that gates AI enrich-once.
    communityFlavorAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Maintains the BB-188 community flavor tier. Any log-entry write recomputes the
 * affected bottle(s) — the entry's before and after bourbonId, covering create,
 * delete, and bottle-change — from every user's confirmed tags. A tag-irrelevant
 * edit is skipped. Sibling of `onLogEntryWrittenUpdateTaste` (same path, kept
 * separate so one failing never breaks the other); best-effort, never throws
 * into the user's save.
 */
export const onLogEntryWrittenAggregateFlavor = onDocumentWritten(
  { document: "users/{userId}/logEntries/{entryId}", region: "us-central1" },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (tagIrrelevantEdit(before, after)) {
      return;
    }
    const affected = new Set<string>();
    for (const id of [before?.bourbonId, after?.bourbonId]) {
      if (typeof id === "string" && id) {
        affected.add(id);
      }
    }
    if (affected.size === 0) {
      return;
    }
    const db = getFirestore();
    for (const bourbonId of affected) {
      try {
        await recomputeBottleCommunity(db, bourbonId);
      } catch (err) {
        // Best-effort: a failed aggregation must never break the entry save.
        logger.warn(`Community flavor aggregation failed for ${bourbonId}`, err);
      }
    }
  }
);
